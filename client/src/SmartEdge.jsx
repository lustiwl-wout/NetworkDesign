import { useContext, useEffect, useRef } from 'react';
import { useStore, useReactFlow, EdgeLabelRenderer, Position } from 'reactflow';
import { EditorCtx } from './EditorCtx.js';

// Custom orthogonal edge.
//
// Routing: the line exits each node perpendicular to the anchor side
// via a short stub, passes through any user-placed waypoints in
// order, and enters the target perpendicular to its anchor side.
// Between consecutive stops we use at most one 90° elbow — no A*,
// no obstacle avoidance; if the line crosses something you don't
// want, grab the line and drag a bend out.
//
// The only control is the line itself:
//   * Grab anywhere along the stroke and drag → a bend appears
//     under your cursor and follows it.
//   * Grab near an existing bend and drag → the bend moves.
//   * Drag a bend back into alignment with its neighbours → it
//     collapses away automatically on release.
// No separate handles or squares; the canvas stays clean.

const STUB = 30;
const GRID = 10;

const selectNodes = (s) => s.nodeInternals;

export default function SmartEdge(props) {
  const {
    id, source, target,
    sourceHandleId, targetHandleId,
    sourceHandle, targetHandle,
    style = {}, markerEnd, label, animated,
  } = props;
  const srcHandle = sourceHandleId ?? sourceHandle ?? null;
  const tgtHandle = targetHandleId ?? targetHandle ?? null;
  const nodeInternals = useStore(selectNodes);
  const sourceNode = nodeInternals.get(source);
  const targetNode = nodeInternals.get(target);

  if (!sourceNode || !targetNode) return null;

  const sa = snapAnchor(
    anchorFromHandle(sourceNode, srcHandle) ?? getSideAnchor(sourceNode, targetNode)
  );
  const ta = snapAnchor(
    anchorFromHandle(targetNode, tgtHandle) ?? getSideAnchor(targetNode, sourceNode)
  );
  const ss = stubOut(sa);
  const ts = stubOut(ta);

  const waypoints = (props.data?.waypoints ?? []).map((p) => ({
    x: snap(p.x),
    y: snap(p.y),
  }));

  // Build each leg between consecutive stops. Stops are
  // [ss, wp0, ..., wpN-1, ts]; leg i routes stops[i] → stops[i+1].
  const stops = [ss, ...waypoints, ts];
  const legs = [];
  let axis = axisOfSide(sa.side);
  for (let i = 0; i < stops.length - 1; i++) {
    const forceExit = i === stops.length - 2 ? axisOfSide(ta.side) : null;
    const { points, exitAxis } = orthogonalLeg(stops[i], stops[i + 1], axis, forceExit);
    legs.push(points);
    axis = exitAxis;
  }

  // Flatten into the full polyline (sa + ss-leg + ... + ts-leg + ta).
  const full = [sa];
  full.push(...legs[0]);
  for (let i = 1; i < legs.length; i++) full.push(...legs[i].slice(1));
  full.push(ta);
  const pathPoints = simplify(full);
  const d = polyline(pathPoints);

  const centre = pathPoints[Math.floor(pathPoints.length / 2)];

  return (
    <>
      {/* The visible stroke. Pointer events on this path become the
          line-drag affordance (handled by LineDragTarget below). */}
      <path
        id={id}
        d={d}
        fill="none"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        className={`react-flow__edge-path${animated ? ' animated' : ''}`}
        style={{ ...style, pointerEvents: 'none' }}
        markerEnd={markerEnd}
      />
      {/* Wide invisible stroke: real hit target for drag / click. */}
      <LineDragTarget edgeId={id} d={d} waypoints={waypoints} legs={legs} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="react-flow__edge-label-floating"
            style={{ transform: `translate(-50%, -50%) translate(${centre.x}px, ${centre.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ---- Line drag: grab the stroke anywhere and pull out a waypoint ----

// Invisible wide-stroke path that absorbs pointerdown on the line.
// Until the pointer actually moves, we don't touch state (that lets
// React Flow still select the edge on a plain click). On the first
// move, we work out which leg was grabbed, splice a waypoint there,
// and track it. On release we collapse it if it's collinear with its
// neighbours so no ghost dots are left behind.
function LineDragTarget({ edgeId, d, waypoints, legs }) {
  const ref = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { setEdges } = useContext(EditorCtx);
  const state = useRef({ edgeId, waypoints, legs, setEdges, screenToFlowPosition });
  state.current = { edgeId, waypoints, legs, setEdges, screenToFlowPosition };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let activePointer = null;
    let downFlow = null;   // flow-space pointer position at pointerdown
    let ownedIdx = null;   // index of the waypoint we've inserted
    let insertLegIdx = null;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const s = state.current;
      const pt = s.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      downFlow = { x: snap(pt.x), y: snap(pt.y) };
      ownedIdx = null;
      insertLegIdx = closestLegIndex(downFlow, s.legs);
      try { el.setPointerCapture(e.pointerId); } catch {}
    };

    const onMove = (e) => {
      if (activePointer == null || e.pointerId !== activePointer) return;
      e.preventDefault();
      const s = state.current;
      const pt = s.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const newPt = { x: snap(pt.x), y: snap(pt.y) };
      // Wait for a real drag (> a few px) so a plain click doesn't
      // insert a phantom waypoint.
      if (ownedIdx === null) {
        const dx = Math.abs(newPt.x - (downFlow?.x ?? newPt.x));
        const dy = Math.abs(newPt.y - (downFlow?.y ?? newPt.y));
        if (dx + dy < GRID) return;
      }
      s.setEdges((eds) => eds.map((ed) => {
        if (ed.id !== s.edgeId) return ed;
        const wps = [...(ed.data?.waypoints ?? [])];
        if (ownedIdx === null) {
          const at = Math.max(0, Math.min(insertLegIdx ?? wps.length, wps.length));
          wps.splice(at, 0, newPt);
          ownedIdx = at;
        } else {
          wps[ownedIdx] = newPt;
        }
        return { ...ed, data: { ...(ed.data ?? {}), waypoints: wps } };
      }));
    };

    const onUp = () => {
      if (activePointer == null) return;
      try { el.releasePointerCapture(activePointer); } catch {}
      activePointer = null;
      downFlow = null;
      const movedIdx = ownedIdx;
      ownedIdx = null;
      insertLegIdx = null;
      if (movedIdx == null) return;
      // Drag ended — compact redundant waypoints.
      state.current.setEdges((eds) => eds.map((ed) => {
        if (ed.id !== state.current.edgeId) return ed;
        const wps = compactWaypoints(ed.data?.waypoints ?? []);
        return { ...ed, data: { ...(ed.data ?? {}), waypoints: wps } };
      }));
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
    };
  }, []);

  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke="transparent"
      strokeWidth="18"
      className="nopan nodrag"
      style={{ pointerEvents: 'stroke', cursor: 'grab', touchAction: 'none' }}
    />
  );
}

// Find the leg whose path is closest to point `p`. Returns the leg
// index in 0..legs.length-1. Used to decide where a new waypoint
// should be inserted when the user grabs the line.
function closestLegIndex(p, legs) {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    for (let j = 1; j < leg.length; j++) {
      const d = distToSegment(p, leg[j - 1], leg[j]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
  }
  return bestI;
}

// Manhattan distance from p to the axis-aligned segment a→b.
function distToSegment(p, a, b) {
  if (a.x === b.x) {
    const y = Math.max(Math.min(a.y, b.y), Math.min(p.y, Math.max(a.y, b.y)));
    return Math.abs(p.x - a.x) + Math.abs(p.y - y);
  }
  const x = Math.max(Math.min(a.x, b.x), Math.min(p.x, Math.max(a.x, b.x)));
  return Math.abs(p.y - a.y) + Math.abs(p.x - x);
}

// Remove waypoints that are collinear with / on the straight-line
// segment between their immediate neighbours. Keeps the data clean
// so no orphan handles accumulate.
function compactWaypoints(wps) {
  if (wps.length === 0) return wps;
  let changed = true;
  let cur = [...wps];
  while (changed) {
    changed = false;
    for (let i = 0; i < cur.length; i++) {
      const prev = cur[i - 1] ?? null;
      const next = cur[i + 1] ?? null;
      if (!prev || !next) continue;
      // Redundant if on the axis-aligned straight between neighbours.
      if (prev.x === next.x && cur[i].x === prev.x) { cur.splice(i, 1); changed = true; break; }
      if (prev.y === next.y && cur[i].y === prev.y) { cur.splice(i, 1); changed = true; break; }
    }
  }
  return cur;
}

// ---- Geometry ----

const snap = (v) => Math.round(v / GRID) * GRID;

function axisOfSide(side) {
  return (side === Position.Left || side === Position.Right) ? 'h' : 'v';
}

// Build a 0- or 1-elbow path from `from` to `to`. `entryAxis` is the
// direction the line arrives in; `forceExitAxis` pins the last
// segment's direction (used for the final leg so the line meets the
// target stub perpendicularly).
function orthogonalLeg(from, to, entryAxis, forceExitAxis) {
  if (from.x === to.x) return { points: [from, to], exitAxis: 'v' };
  if (from.y === to.y) return { points: [from, to], exitAxis: 'h' };
  let elbow;
  let exit;
  if (forceExitAxis === 'v') {
    elbow = { x: to.x, y: from.y };
    exit = 'v';
  } else if (forceExitAxis === 'h') {
    elbow = { x: from.x, y: to.y };
    exit = 'h';
  } else if (entryAxis === 'h') {
    elbow = { x: to.x, y: from.y };
    exit = 'v';
  } else {
    elbow = { x: from.x, y: to.y };
    exit = 'h';
  }
  return { points: [from, elbow, to], exitAxis: exit };
}

function anchorFromHandle(node, handleId) {
  if (!node || !handleId) return null;
  const [side, idxStr] = handleId.split('-');
  const idx = Number(idxStr);
  if (!['t', 'r', 'b', 'l'].includes(side) || !Number.isFinite(idx)) return null;
  const p = node.positionAbsolute ?? node.position;
  const w = node.width ?? 170;
  const h = node.height ?? 150;
  const sideCount = Math.max(1, Number(node.data?.handles?.[side]) || 1);
  const snapPx = (v) => Math.round(v / GRID) * GRID;
  const along_h = snapPx((w * (idx + 1)) / (sideCount + 1));
  const along_v = snapPx((h * (idx + 1)) / (sideCount + 1));
  switch (side) {
    case 't': return { x: p.x + along_h, y: p.y,         side: Position.Top };
    case 'b': return { x: p.x + along_h, y: p.y + h,     side: Position.Bottom };
    case 'l': return { x: p.x,           y: p.y + along_v, side: Position.Left };
    case 'r': return { x: p.x + w,       y: p.y + along_v, side: Position.Right };
    default:  return null;
  }
}

function getSideAnchor(self, other) {
  const sp = self.positionAbsolute ?? self.position;
  const op = other.positionAbsolute ?? other.position;
  const w = self.width ?? 170;
  const h = self.height ?? 150;
  const scx = sp.x + w / 2;
  const scy = sp.y + h / 2;
  const ocx = op.x + (other.width ?? 170) / 2;
  const ocy = op.y + (other.height ?? 150) / 2;
  const dx = ocx - scx;
  const dy = ocy - scy;
  if (Math.abs(dx) * h >= Math.abs(dy) * w) {
    return dx >= 0
      ? { x: sp.x + w, y: scy, side: Position.Right }
      : { x: sp.x,     y: scy, side: Position.Left };
  }
  return dy >= 0
    ? { x: scx, y: sp.y + h, side: Position.Bottom }
    : { x: scx, y: sp.y,     side: Position.Top };
}

function snapAnchor(a) {
  return { x: snap(a.x), y: snap(a.y), side: a.side };
}

function stubOut(a) {
  switch (a.side) {
    case Position.Top:    return { x: a.x, y: a.y - STUB };
    case Position.Bottom: return { x: a.x, y: a.y + STUB };
    case Position.Left:   return { x: a.x - STUB, y: a.y };
    case Position.Right:  return { x: a.x + STUB, y: a.y };
    default:              return { x: a.x, y: a.y };
  }
}

function simplify(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) ||
                      (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function polyline(points) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}
