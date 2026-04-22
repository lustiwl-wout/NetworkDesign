import { useContext, useEffect, useRef } from 'react';
import { useStore, useReactFlow, EdgeLabelRenderer, Position } from 'reactflow';
import { EditorCtx } from './EditorCtx.js';

// Custom orthogonal edge.
//
// Routing: the line exits each node perpendicular to the anchor side
// (via a short stub), passes through any user-placed waypoints in
// order, and enters the target perpendicular to its anchor side.
// Between consecutive stops we use at most one 90° elbow, so the
// shape always stays simple and predictable. There's no automatic
// obstacle avoidance — if the line crosses something you don't
// want it to, drop a waypoint and the user stays fully in control.
//
// Two kinds of handles appear on every edge:
//   * A small open square at the midpoint of each leg. Dragging
//     one creates a new waypoint at that spot and lets you shape
//     the leg into two.
//   * A filled square at every existing waypoint. Drag to move it,
//     double-click to remove it.

const STUB = 30;
const GRID = 10;

const selectNodes = (s) => s.nodeInternals;

export default function SmartEdge(props) {
  const {
    id, source, target,
    sourceHandleId, targetHandleId,
    sourceHandle, targetHandle,
    style = {}, markerEnd, label, animated, selected,
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
    x: Math.round(p.x / GRID) * GRID,
    y: Math.round(p.y / GRID) * GRID,
  }));

  // Build each leg between consecutive stops. Stops are
  // [ss, wp0, wp1, ..., wpN-1, ts] — so leg i is the route between
  // stops[i] and stops[i+1]. Stubs enter/leave on a fixed axis, and
  // each leg carries that axis forward so we never double-back.
  const stops = [ss, ...waypoints, ts];
  const legs = [];
  let axis = axisOfSide(sa.side);
  for (let i = 0; i < stops.length - 1; i++) {
    const forceExit = i === stops.length - 2 ? axisOfSide(ta.side) : null;
    const { points: legPoints, exitAxis } = orthogonalLeg(
      stops[i], stops[i + 1], axis, forceExit
    );
    legs.push(legPoints);
    axis = exitAxis;
  }

  // Concatenate legs into one polyline (don't duplicate shared stops).
  const full = [sa];
  full.push(...legs[0]);
  for (let i = 1; i < legs.length; i++) full.push(...legs[i].slice(1));
  full.push(ta);
  const pathPoints = simplify(full);
  const d = polyline(pathPoints);

  const centre = pathPoints[Math.floor(pathPoints.length / 2)];
  const totalLen = polylineLength(pathPoints);

  return (
    <>
      <path
        id={id}
        d={d}
        fill="none"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        className={`react-flow__edge-path${animated ? ' animated' : ''}`}
        style={{ ...style, pointerEvents: 'stroke' }}
        markerEnd={markerEnd}
      />
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
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="edge-size-chip"
            style={{ transform: `translate(-50%, -50%) translate(${centre.x}px, ${centre.y + 16}px)` }}
          >
            {Math.round(totalLen)} px
          </div>
        </EdgeLabelRenderer>
      )}
      <EdgeLabelRenderer>
        {legs.map((legPts, i) => {
          if (arcLength(legPts) < 60) return null;
          const mid = arcMidpoint(legPts);
          return (
            <LegHandle
              key={`leg-${i}`}
              edgeId={id}
              legIndex={i}
              mid={mid}
              horizontal={mid.horizontal}
            />
          );
        })}
        {waypoints.map((wp, i) => (
          <WaypointMoveHandle
            key={`wp-${i}`}
            edgeId={id}
            wpIndex={i}
            pos={wp}
          />
        ))}
      </EdgeLabelRenderer>
    </>
  );
}

// ---- Handles ----

// Shared drag setup for a handle that uses native pointer events and
// pointer capture so the cursor doesn't need to stay on the handle
// during the drag.
function useHandleDrag(ref, onDrag) {
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let activePointer = null;
    let firstMove = true;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      firstMove = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (activePointer == null || e.pointerId !== activePointer) return;
      e.preventDefault();
      onDragRef.current?.(e.clientX, e.clientY, firstMove);
      firstMove = false;
    };
    const onUp = () => {
      if (activePointer == null) return;
      try { el.releasePointerCapture(activePointer); } catch {}
      activePointer = null;
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
  }, [ref]);
}

// One open square per leg. Dragging it creates a new waypoint at
// legIndex in the edge's waypoints array, then repositions it as the
// pointer moves.
function LegHandle({ edgeId, legIndex, mid, horizontal }) {
  const ref = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { setEdges } = useContext(EditorCtx);
  const state = useRef({ edgeId, legIndex, setEdges, screenToFlowPosition });
  state.current = { edgeId, legIndex, setEdges, screenToFlowPosition };
  const createdIdxRef = useRef(null);

  useHandleDrag(ref, (cx, cy, firstMove) => {
    const { edgeId: eid, legIndex: li, setEdges: se, screenToFlowPosition: s2f } = state.current;
    const pt = s2f({ x: cx, y: cy });
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    const newPt = { x: snap(pt.x), y: snap(pt.y) };
    if (firstMove) createdIdxRef.current = null;
    se((eds) => eds.map((ed) => {
      if (ed.id !== eid) return ed;
      const wps = [...(ed.data?.waypoints ?? [])];
      if (createdIdxRef.current === null) {
        // Insert a fresh waypoint at legIndex (leg i lies between
        // stops[i] and stops[i+1]; in the waypoints array that slot
        // is `i`, so splice at i inserts between the two stops).
        const at = Math.max(0, Math.min(li, wps.length));
        wps.splice(at, 0, newPt);
        createdIdxRef.current = at;
      } else {
        wps[createdIdxRef.current] = newPt;
      }
      return { ...ed, data: { ...(ed.data ?? {}), waypoints: wps } };
    }));
  });

  return (
    <div
      ref={ref}
      className={`edge-waypoint nodrag nopan ${horizontal ? 'h' : 'v'}`}
      style={{
        transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
        touchAction: 'none',
      }}
      title="Drag to bend the line"
    />
  );
}

// Filled square at an existing waypoint. Drag to reposition it,
// double-click to remove it.
function WaypointMoveHandle({ edgeId, wpIndex, pos }) {
  const ref = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { setEdges } = useContext(EditorCtx);
  const state = useRef({ edgeId, wpIndex, setEdges, screenToFlowPosition });
  state.current = { edgeId, wpIndex, setEdges, screenToFlowPosition };

  useHandleDrag(ref, (cx, cy) => {
    const { edgeId: eid, wpIndex: i, setEdges: se, screenToFlowPosition: s2f } = state.current;
    const pt = s2f({ x: cx, y: cy });
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    const newPt = { x: snap(pt.x), y: snap(pt.y) };
    se((eds) => eds.map((ed) => {
      if (ed.id !== eid) return ed;
      const wps = [...(ed.data?.waypoints ?? [])];
      if (i >= 0 && i < wps.length) wps[i] = newPt;
      return { ...ed, data: { ...(ed.data ?? {}), waypoints: wps } };
    }));
  });

  const onDoubleClick = (e) => {
    e.stopPropagation();
    const { edgeId: eid, wpIndex: i, setEdges: se } = state.current;
    se((eds) => eds.map((ed) => {
      if (ed.id !== eid) return ed;
      const wps = (ed.data?.waypoints ?? []).filter((_, j) => j !== i);
      return { ...ed, data: { ...(ed.data ?? {}), waypoints: wps } };
    }));
  };

  return (
    <div
      ref={ref}
      className="edge-waypoint edge-waypoint--placed nodrag nopan"
      style={{
        transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
        touchAction: 'none',
      }}
      onDoubleClick={onDoubleClick}
      title="Drag to move · double-click to remove"
    />
  );
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

function arcLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) +
             Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

function arcMidpoint(points) {
  const total = arcLength(points);
  const target = total / 2;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        horizontal: a.y === b.y,
      };
    }
    acc += segLen;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, horizontal: true };
}

function polylineLength(points) {
  return arcLength(points);
}

// Decode a handle id of the form "s-i" where s ∈ {t,r,b,l} and i is
// the zero-based index along that side. Handle positions are rendered
// in grid-aligned px so the edge endpoint lands on the exact pixel as
// the handle dot.
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

// Collapse collinear runs: b is redundant when a, b, c share a row
// or a column.
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
