import { useViewport } from 'reactflow';

// Visual guides drawn on top of the canvas while a node is being
// dragged. Two kinds:
//   * Alignment: a thin magenta line when the dragged node's edge
//     (left/right/centerX or top/bottom/centerY) matches the same
//     edge of another node. The line spans both nodes so it's
//     obvious *which* pair has snapped into alignment.
//   * Equal spacing: when the gap to the nearest node on one side
//     equals the gap on the opposite side (within tolerance), the
//     two gaps are annotated with bracket markers so the user knows
//     they can release here for perfect evenness.
//
// Purely visual — no snapping. The 10 px grid snap already runs, and
// stealing positions silently would frustrate a user trying to push
// a node slightly off-alignment for a reason.

export function AlignmentGuides({ guides }) {
  const { x, y, zoom } = useViewport();
  if (!guides || guides.length === 0) return null;
  return (
    <svg
      className="alignment-guides"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
        overflow: 'visible',
      }}
    >
      <g style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}>
        {guides.map((g, i) => renderGuide(g, i))}
      </g>
    </svg>
  );
}

function renderGuide(g, i) {
  const stroke = '#f472b6'; // magenta; stands out on both themes
  const sw = 1 / (g.zoom || 1); // keep stroke 1 CSS px regardless of zoom
  switch (g.kind) {
    case 'v':
      return (
        <line
          key={`v-${i}`}
          x1={g.x} y1={g.y1} x2={g.x} y2={g.y2}
          stroke={stroke} strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    case 'h':
      return (
        <line
          key={`h-${i}`}
          x1={g.x1} y1={g.y} x2={g.x2} y2={g.y}
          stroke={stroke} strokeWidth={sw}
          vectorEffect="non-scaling-stroke"
        />
      );
    case 'gap-h':
      // Horizontal bracket: two parallel short verticals at the gap's
      // ends connected by a thin line, on both left and right gaps.
      return (
        <g key={`gh-${i}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke">
          <line x1={g.x1} y1={g.y - 4} x2={g.x1} y2={g.y + 4} />
          <line x1={g.x2} y1={g.y - 4} x2={g.x2} y2={g.y + 4} />
          <line x1={g.x1} y1={g.y} x2={g.x2} y2={g.y} />
        </g>
      );
    case 'gap-v':
      return (
        <g key={`gv-${i}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke">
          <line x1={g.x - 4} y1={g.y1} x2={g.x + 4} y2={g.y1} />
          <line x1={g.x - 4} y1={g.y2} x2={g.x + 4} y2={g.y2} />
          <line x1={g.x} y1={g.y1} x2={g.x} y2={g.y2} />
        </g>
      );
    default:
      return null;
  }
}

// ---- Guide computation ----

const TOL = 1; // flow-space px; we already snap to 10 px so 1 is plenty

// Build the guide primitives for the dragged node against every
// other node. Caller passes every visible node (including the one
// being dragged, which we skip by id). `overrides` lets us use the
// dragged node's live position, which is more responsive than the
// React Flow store during a fast drag.
export function computeGuides(draggedId, nodes, overrides = null) {
  if (!draggedId) return [];
  const dragged = nodes.find((n) => n.id === draggedId);
  if (!dragged) return [];
  const a = bounds(dragged, overrides);
  if (!a) return [];

  const others = nodes
    .map((n) => (n.id === draggedId ? null : bounds(n)))
    .filter(Boolean);

  const out = [];

  // Alignment lines.
  for (const b of others) {
    for (const [ax, kind] of [[a.l, 'l'], [a.cx, 'c'], [a.r, 'r']]) {
      for (const bx of [b.l, b.cx, b.r]) {
        if (Math.abs(ax - bx) <= TOL) {
          out.push({
            kind: 'v',
            x: bx,
            y1: Math.min(a.t, b.t),
            y2: Math.max(a.b, b.b),
          });
        }
      }
    }
    for (const [ay] of [[a.t], [a.cy], [a.b]]) {
      for (const by of [b.t, b.cy, b.b]) {
        if (Math.abs(ay - by) <= TOL) {
          out.push({
            kind: 'h',
            y: by,
            x1: Math.min(a.l, b.l),
            x2: Math.max(a.r, b.r),
          });
        }
      }
    }
  }

  // Equal-spacing indicators. Look at "rows" (others that overlap a
  // vertically) and "columns" (others that overlap a horizontally).
  const sameRow = others.filter((b) => overlap(a.t, a.b, b.t, b.b));
  const sameCol = others.filter((b) => overlap(a.l, a.r, b.l, b.r));

  // Horizontal spacing: nearest other on left vs right of dragged.
  const left  = closest(sameRow.filter((b) => b.r <= a.l), (b) => a.l - b.r);
  const right = closest(sameRow.filter((b) => b.l >= a.r), (b) => b.l - a.r);
  if (left && right) {
    const gL = a.l - left.r;
    const gR = right.l - a.r;
    if (gL > 0 && gR > 0 && Math.abs(gL - gR) <= TOL) {
      const y = a.cy;
      out.push({ kind: 'gap-h', x1: left.r, x2: a.l, y });
      out.push({ kind: 'gap-h', x1: a.r,    x2: right.l, y });
    }
  }
  // Vertical spacing.
  const above = closest(sameCol.filter((b) => b.b <= a.t), (b) => a.t - b.b);
  const below = closest(sameCol.filter((b) => b.t >= a.b), (b) => b.t - a.b);
  if (above && below) {
    const gA = a.t - above.b;
    const gB = below.t - a.b;
    if (gA > 0 && gB > 0 && Math.abs(gA - gB) <= TOL) {
      const x = a.cx;
      out.push({ kind: 'gap-v', y1: above.b, y2: a.t, x });
      out.push({ kind: 'gap-v', y1: a.b,    y2: below.t, x });
    }
  }

  // Dedupe — the edge-cross-product above can produce duplicates for
  // perfectly aligned rectangles (e.g. same-size nodes).
  const seen = new Set();
  return out.filter((g) => {
    const k = JSON.stringify(g);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function bounds(n, overrides = null) {
  const w = n.width  ?? n.style?.width  ?? 0;
  const h = n.height ?? n.style?.height ?? 0;
  if (!w || !h) return null;
  const p = overrides?.[n.id]
    ?? n.positionAbsolute
    ?? n.position;
  const l = p.x;
  const t = p.y;
  return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
}

function overlap(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

function closest(items, distFn) {
  let best = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = distFn(it);
    if (d >= 0 && d < bestD) { best = it; bestD = d; }
  }
  return best;
}
