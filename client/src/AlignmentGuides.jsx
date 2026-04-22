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

const TOL = 1;         // edge/centre alignment: grid snap makes this exact
const SPACING_TOL = 3; // equal spacing: small slack for manually-placed nodes

// Build the guide primitives for the dragged node against every
// other node. Caller passes every visible node (including the one
// being dragged, which we skip by id). `overrides` lets us use the
// dragged node's live position, which is more responsive than the
// React Flow store during a fast drag.
export function computeGuides(draggedId, nodes, overrides = null) {
  if (!draggedId) return [];
  const dragged = nodes.find((n) => n.id === draggedId);
  if (!dragged) return [];

  // Pre-compute absolute positions for every node. React Flow stores
  // child-of-zone positions RELATIVE to the parent in node.position;
  // node.positionAbsolute is only populated on nodes that React Flow
  // has measured. Walking parentNode ourselves makes the guides work
  // for nodes inside zones too.
  const absIndex = new Map();
  for (const n of nodes) absIndex.set(n.id, absoluteOf(n, nodes));
  if (overrides) {
    for (const [id, pos] of Object.entries(overrides)) absIndex.set(id, pos);
  }

  const a = bounds(dragged, absIndex.get(dragged.id));
  if (!a) return [];

  // Only compare against nodes it makes sense to align with. Rules:
  //   * Same type only (device↔device, zone↔zone).
  //     A device lining up with a zone's edge or label is
  //     accidental, not intentional.
  //   * Skip annotation nodes — free-text markers aren't layout
  //     anchors.
  //   * Skip the dragged node's ancestors / descendants, so a
  //     device dragged inside a zone doesn't show a guide against
  //     its own parent.
  const ancestorIds = ancestorsOf(dragged, nodes);
  const descendantIds = descendantsOf(dragged.id, nodes);
  const others = nodes
    .filter((n) => n.id !== draggedId)
    .filter((n) => n.type !== 'annotation' && dragged.type !== 'annotation')
    .filter((n) => n.type === dragged.type)
    .filter((n) => !ancestorIds.has(n.id) && !descendantIds.has(n.id))
    .map((n) => bounds(n, absIndex.get(n.id)))
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

  // Equal-spacing indicators. Build the "row" (everything whose
  // vertical range overlaps the dragged node) and "column" (horizontal
  // range overlaps), sort by position, and walk the gaps. When the
  // gap on either side of the dragged node matches, annotate the
  // chain — not just the two immediate neighbours — so e.g. four
  // VLANs in a row all light up when evenly distributed.
  const sameRow = others.filter((b) => overlap(a.t, a.b, b.t, b.b));
  const sameCol = others.filter((b) => overlap(a.l, a.r, b.l, b.r));

  // Horizontal spacing.
  annotateChainH(a, sameRow, out);
  // Vertical spacing.
  annotateChainV(a, sameCol, out);

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

function bounds(n, absPos) {
  const w = n.width  ?? n.style?.width  ?? 0;
  const h = n.height ?? n.style?.height ?? 0;
  if (!w || !h) return null;
  const p = absPos ?? n.positionAbsolute ?? n.position;
  const l = p.x;
  const t = p.y;
  return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
}

function ancestorsOf(node, allNodes) {
  const ids = new Set();
  let parentId = node.parentNode;
  while (parentId && !ids.has(parentId)) {
    ids.add(parentId);
    const p = allNodes.find((n) => n.id === parentId);
    if (!p) break;
    parentId = p.parentNode;
  }
  return ids;
}

function descendantsOf(rootId, allNodes) {
  const ids = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of allNodes) {
      if (ids.has(n.id)) continue;
      if (n.parentNode === rootId || (n.parentNode && ids.has(n.parentNode))) {
        ids.add(n.id);
        grew = true;
      }
    }
  }
  return ids;
}

// Walk parentNode chain to compute a node's position in flow coords.
function absoluteOf(node, allNodes) {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let parentId = node.parentNode;
  const seen = new Set();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const p = allNodes.find((n) => n.id === parentId);
    if (!p) break;
    x += p.position?.x ?? 0;
    y += p.position?.y ?? 0;
    parentId = p.parentNode;
  }
  return { x, y };
}

function overlap(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

// Horizontal chain: sort dragged + row by left edge, compute every
// adjacent gap, then annotate every contiguous run of equal-sized
// gaps that touches the dragged node. Works whether the dragged node
// is in the middle of the chain or at either end.
function annotateChainH(dragged, row, out) {
  annotateChain(
    dragged,
    row,
    (p) => p.l,
    (a, b) => b.l - a.r,
    (a, b) => ({ kind: 'gap-h', x1: a.r, x2: b.l, y: (a.cy + b.cy) / 2 }),
    out,
  );
}

function annotateChainV(dragged, col, out) {
  annotateChain(
    dragged,
    col,
    (p) => p.t,
    (a, b) => b.t - a.b,
    (a, b) => ({ kind: 'gap-v', y1: a.b, y2: b.t, x: (a.cx + b.cx) / 2 }),
    out,
  );
}

function annotateChain(dragged, siblings, sortKey, gapOf, makeMarker, out) {
  if (!siblings.length) return;
  const items = [...siblings, dragged].sort((p, q) => sortKey(p) - sortKey(q));
  const idx = items.indexOf(dragged);
  if (idx < 0) return;
  if (items.length < 3) return; // 2 items = 1 gap, no "even" to detect

  // All adjacent gap sizes.
  const gaps = [];
  for (let i = 0; i + 1 < items.length; i++) {
    gaps.push(gapOf(items[i], items[i + 1]));
  }

  // Gap indices that actually touch the dragged node. If dragged is
  // at an end there's only one; if middle there are two.
  const touching = [];
  if (idx - 1 >= 0)          touching.push(idx - 1);
  if (idx < gaps.length)     touching.push(idx);
  if (touching.length === 0) return;
  for (const gi of touching) if (gaps[gi] <= 0) return; // overlapping nodes

  // If dragged is in the middle, its two gaps must themselves match
  // for the row to count as "even"; otherwise the target is obvious.
  if (touching.length === 2 && Math.abs(gaps[touching[0]] - gaps[touching[1]]) > SPACING_TOL) return;
  const target = gaps[touching[0]];

  // Expand outward, gathering contiguous gaps that match the target.
  const show = new Set(touching);
  let l = Math.min(...touching);
  for (let i = l - 1; i >= 0; i--) {
    if (Math.abs(gaps[i] - target) > SPACING_TOL) break;
    show.add(i);
  }
  let r = Math.max(...touching);
  for (let i = r + 1; i < gaps.length; i++) {
    if (Math.abs(gaps[i] - target) > SPACING_TOL) break;
    show.add(i);
  }

  // Require at least one extra matching gap beyond the touching
  // ones, OR that the touching pair already agrees (middle drag) —
  // otherwise a single adjacent gap isn't evidence of evenness.
  if (touching.length === 1 && show.size < 2) return;

  for (const gi of show) {
    out.push(makeMarker(items[gi], items[gi + 1]));
  }
}

