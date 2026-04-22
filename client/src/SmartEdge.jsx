import { useContext, useEffect, useRef } from 'react';
import { useStore, useReactFlow, EdgeLabelRenderer, Position } from 'reactflow';
import { EditorCtx } from './EditorCtx.js';

// Orthogonal edge with a BOUNDED, ADJUSTABLE path.
//
// Routing is fully determined by the two anchor positions and sides:
//   * If the stubs are already collinear → single straight segment.
//   * If the stubs exit on perpendicular axes → L-shape, 1 elbow.
//   * If the stubs exit on the same axis but aren't collinear → Z-shape,
//     2 elbows with a middle segment that can be shifted perpendicular
//     by the user.
//
// The only user control is the Z-middle segment: grab it and drag
// perpendicular to shift where the bend happens. Straight and L-
// shape edges are not adjustable — to change those, move the
// endpoints or use a different connection handle on the node.
//
// Data: `data.bend` is a single number (pixels) that shifts the
// Z-middle segment away from its natural midpoint. Undefined / null
// means "use natural midpoint".

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

  const userBend = Number.isFinite(props.data?.bend) ? props.data.bend : null;
  const { points, middle } = route(sa, ss, ts, ta, userBend);
  const d = polyline(points);

  return (
    <>
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
      {/* Clickable stroke for edge-selection — but NOT drag-to-bend. */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth="16"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="react-flow__edge-label-floating"
            style={{
              transform: `translate(-50%, -50%) translate(${points[Math.floor(points.length / 2)].x}px, ${points[Math.floor(points.length / 2)].y}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {middle && (
        <EdgeLabelRenderer>
          <BendHandle edgeId={id} middle={middle} />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ---- Routing ----

// Given source/target anchors (with side) and their stubs, return the
// full polyline [sa, ss, ..., ts, ta] plus a description of the
// "middle segment" (the user-adjustable one) if any.
function route(sa, ss, ts, ta, userBend) {
  const saAxis = axisOfSide(sa.side);
  const taAxis = axisOfSide(ta.side);

  // --- Straight (single segment between stubs) ---
  if (saAxis === 'h' && taAxis === 'h' && ss.y === ts.y) {
    return { points: simplify([sa, ss, ts, ta]), middle: null };
  }
  if (saAxis === 'v' && taAxis === 'v' && ss.x === ts.x) {
    return { points: simplify([sa, ss, ts, ta]), middle: null };
  }

  // --- L-shape (axes differ, one elbow) ---
  if (saAxis !== taAxis) {
    const elbow = saAxis === 'h'
      ? { x: ts.x, y: ss.y }
      : { x: ss.x, y: ts.y };
    return { points: simplify([sa, ss, elbow, ts, ta]), middle: null };
  }

  // --- Z-shape (same axis, not aligned) — adjustable middle ---
  if (saAxis === 'h') {
    // Middle segment is vertical. Its x is the adjustable coordinate.
    const natural = snap((ss.x + ts.x) / 2);
    const shift = userBend == null ? 0 : userBend;
    const midX = snap(natural + shift);
    const e1 = { x: midX, y: ss.y };
    const e2 = { x: midX, y: ts.y };
    return {
      points: simplify([sa, ss, e1, e2, ts, ta]),
      middle: {
        axis: 'v',          // middle segment is vertical
        natural,             // natural perpendicular coordinate (x in this case)
        current: midX,       // current perpendicular coordinate
        at: { x: midX, y: snap((ss.y + ts.y) / 2) }, // handle position
      },
    };
  }
  // saAxis === 'v': middle segment is horizontal, y adjustable
  const natural = snap((ss.y + ts.y) / 2);
  const shift = userBend == null ? 0 : userBend;
  const midY = snap(natural + shift);
  const e1 = { x: ss.x, y: midY };
  const e2 = { x: ts.x, y: midY };
  return {
    points: simplify([sa, ss, e1, e2, ts, ta]),
    middle: {
      axis: 'h',
      natural,
      current: midY,
      at: { x: snap((ss.x + ts.x) / 2), y: midY },
    },
  };
}

function axisOfSide(side) {
  return (side === Position.Left || side === Position.Right) ? 'h' : 'v';
}

// ---- Bend handle: drag the middle segment perpendicular ----

function BendHandle({ edgeId, middle }) {
  const ref = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { setEdges, takeSnapshot } = useContext(EditorCtx);
  const state = useRef({ edgeId, middle, setEdges, screenToFlowPosition, takeSnapshot });
  state.current = { edgeId, middle, setEdges, screenToFlowPosition, takeSnapshot };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let activePointer = null;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      state.current.takeSnapshot?.();
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (activePointer == null || e.pointerId !== activePointer) return;
      e.preventDefault();
      const s = state.current;
      const pt = s.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      // Only the perpendicular axis matters. For a vertical middle
      // segment (axis: 'v'), the adjustable coordinate is x; for a
      // horizontal middle segment it's y. `bend` is the shift away
      // from the natural midpoint, in flow pixels.
      const raw = s.middle.axis === 'v' ? pt.x : pt.y;
      const bend = snap(raw) - s.middle.natural;
      s.setEdges((eds) => eds.map((ed) => {
        if (ed.id !== s.edgeId) return ed;
        return { ...ed, data: { ...(ed.data ?? {}), bend } };
      }));
    };
    const onUp = () => {
      if (activePointer == null) return;
      try { el.releasePointerCapture(activePointer); } catch {}
      activePointer = null;
      // If the bend lands (nearly) back at the natural midpoint,
      // drop it so the path snaps back to auto.
      const s = state.current;
      s.setEdges((eds) => eds.map((ed) => {
        if (ed.id !== s.edgeId) return ed;
        const cur = Number.isFinite(ed.data?.bend) ? ed.data.bend : 0;
        if (Math.abs(cur) < GRID) {
          const { bend, ...rest } = ed.data ?? {};
          return { ...ed, data: rest };
        }
        return ed;
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

  const cursor = middle.axis === 'v' ? 'ew-resize' : 'ns-resize';
  return (
    <div
      ref={ref}
      className="edge-bend-handle nodrag nopan"
      style={{
        transform: `translate(-50%, -50%) translate(${middle.at.x}px, ${middle.at.y}px)`,
        touchAction: 'none',
        cursor,
      }}
      title="Drag to shift the bend"
    />
  );
}

// ---- Geometry helpers ----

const snap = (v) => Math.round(v / GRID) * GRID;

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
