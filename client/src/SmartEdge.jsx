import { useMemo } from 'react';
import { useStore, EdgeLabelRenderer, Position } from 'reactflow';

// Custom orthogonal router. Built from scratch because every off-the-
// shelf option we tried either produced diagonals at the endpoints or
// let lines pass through non-endpoint nodes / zones.
//
// Guarantees (by construction):
//   * Every segment is horizontal or vertical. No diagonals anywhere.
//   * Lines route around EVERY other node (both devices and zones).
//   * Endpoints always leave the node perpendicular to the side that
//     faces the other endpoint (via a short stub), so the first and
//     last segments are axis-aligned.
//   * On failure (truly impossible layout) we draw a visibly broken
//     warning edge rather than silently cut through a node.

const OBSTACLE_PAD = 14; // halo around every non-endpoint node
const GRID         = 10; // A* grid resolution
const STUB         = 30; // length of the perpendicular stub from each anchor

const selectNodes = (s) => s.nodeInternals;

export default function SmartEdge(props) {
  const { id, source, target, style = {}, markerEnd, label, animated } = props;
  const nodeInternals = useStore(selectNodes);
  const sourceNode = nodeInternals.get(source);
  const targetNode = nodeInternals.get(target);

  // Obstacles: every measured node EXCEPT
  //  (a) the edge's own endpoints,
  //  (b) any ancestor zone of either endpoint.
  // Rule (b) is what lets an edge from an outside network device cross
  // the border of the zone that contains the target and land on a
  // specific device inside: the containing zone is not an obstacle for
  // edges whose endpoint lives in it. Every OTHER zone stays an
  // obstacle so lines don't leak through unrelated zone backgrounds.
  const obstacles = useMemo(() => {
    const excluded = new Set([source, target]);
    const walkAncestors = (id) => {
      let cur = nodeInternals.get(id);
      while (cur && cur.parentNode) {
        excluded.add(cur.parentNode);
        cur = nodeInternals.get(cur.parentNode);
      }
    };
    walkAncestors(source);
    walkAncestors(target);

    const list = [];
    for (const n of nodeInternals.values()) {
      if (excluded.has(n.id)) continue;
      if (n.type === 'annotation') continue;
      if (!n.width || !n.height) continue;
      const p = n.positionAbsolute ?? n.position;
      list.push({
        x: p.x - OBSTACLE_PAD,
        y: p.y - OBSTACLE_PAD,
        w: n.width  + OBSTACLE_PAD * 2,
        h: n.height + OBSTACLE_PAD * 2,
      });
    }
    return list;
  }, [nodeInternals, source, target]);

  if (!sourceNode || !targetNode) return null;

  // Anchors + stubs — every coordinate is quantised to the grid so the
  // first and last segments can never become micro-diagonals when the
  // node's side midpoint falls between grid cells.
  const sa = snapAnchor(getSideAnchor(sourceNode, targetNode));
  const ta = snapAnchor(getSideAnchor(targetNode, sourceNode));
  const ss = stubOut(sa);
  const ts = stubOut(ta);

  const midRaw = astar(ss, ts, obstacles);

  if (!midRaw) return renderWarning(id, sa, ta, style, markerEnd);

  // A* on a 10 px grid produces lots of tiny "staircase" steps when the
  // start and end aren't axis-aligned. Shortcut greedily replaces runs
  // of small corners with the farthest-reachable destination via a
  // single L-shape, eliminating visual zigzag.
  const mid = shortcut(midRaw, obstacles);

  const raw = [sa, ...mid, ta];
  const points = simplify(raw);
  const d = polyline(points);

  const centre = points[Math.floor(points.length / 2)];

  return (
    <>
      <path
        id={id}
        d={d}
        fill="none"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        className={`react-flow__edge-path${animated ? ' animated' : ''}`}
        style={style}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div className="react-flow__edge-label-floating"
            style={{ transform: `translate(-50%, -50%) translate(${centre.x}px, ${centre.y}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ---- Geometry ----

function getSideAnchor(self, other) {
  const sp = self.positionAbsolute ?? self.position;
  const op = other.positionAbsolute ?? other.position;
  const w = self.width  ?? 170;
  const h = self.height ?? 150;
  const scx = sp.x + w / 2;
  const scy = sp.y + h / 2;
  const ocx = op.x + (other.width  ?? 170) / 2;
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
  return { x: quant(a.x), y: quant(a.y), side: a.side };
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

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function blocked(x, y, obstacles) {
  for (const r of obstacles) if (pointInRect(x, y, r)) return true;
  return false;
}

// ---- A* on an orthogonal grid ----

function astar(start, end, obstacles) {
  const sx = quant(start.x);
  const sy = quant(start.y);
  const ex = quant(end.x);
  const ey = quant(end.y);

  if (sx === ex && sy === ey) return [];

  // Compute a bounding box of interest so the grid stays finite. Include
  // start, end and every obstacle rect with some slack.
  let minX = Math.min(sx, ex) - GRID * 8;
  let minY = Math.min(sy, ey) - GRID * 8;
  let maxX = Math.max(sx, ex) + GRID * 8;
  let maxY = Math.max(sy, ey) + GRID * 8;
  for (const r of obstacles) {
    minX = Math.min(minX, r.x - GRID);
    minY = Math.min(minY, r.y - GRID);
    maxX = Math.max(maxX, r.x + r.w + GRID);
    maxY = Math.max(maxY, r.y + r.h + GRID);
  }

  const inBounds = (x, y) =>
    x >= minX && x <= maxX && y >= minY && y <= maxY;

  const key = (x, y) => `${x},${y}`;

  // Simple priority queue. O(n log n) via sorted insert — fine for our
  // small grids.
  const open = [];
  const push = (node) => {
    let lo = 0, hi = open.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (open[mid].f > node.f) hi = mid; else lo = mid + 1;
    }
    open.splice(lo, 0, node);
  };

  const cameFrom = new Map();
  const gScore = new Map();

  gScore.set(key(sx, sy), 0);
  push({ x: sx, y: sy, f: Math.abs(ex - sx) + Math.abs(ey - sy) });

  const MAX_ITER = 60000;
  let iter = 0;

  while (open.length && iter++ < MAX_ITER) {
    const cur = open.shift();
    if (cur.x === ex && cur.y === ey) return reconstruct(cameFrom, cur, sx, sy);

    const curKey = key(cur.x, cur.y);
    const curG = gScore.get(curKey) ?? Infinity;

    for (const [dx, dy] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (blocked(nx, ny, obstacles)) continue;
      const nKey = key(nx, ny);
      const tentative = curG + GRID;
      if (tentative < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, { x: cur.x, y: cur.y });
        gScore.set(nKey, tentative);
        push({ x: nx, y: ny, f: tentative + Math.abs(ex - nx) + Math.abs(ey - ny) });
      }
    }
  }
  return null;
}

function reconstruct(cameFrom, end, sx, sy) {
  const path = [{ x: end.x, y: end.y }];
  let cur = cameFrom.get(`${end.x},${end.y}`);
  while (cur) {
    path.unshift({ x: cur.x, y: cur.y });
    if (cur.x === sx && cur.y === sy) break;
    cur = cameFrom.get(`${cur.x},${cur.y}`);
  }
  return path;
}

function quant(v) { return Math.round(v / GRID) * GRID; }

// ---- Post-processing ----

// Does an axis-aligned segment from a to b avoid every obstacle?
// Obstacles are already padded rectangles. For a non-axis-aligned pair
// we return false — this helper is only for orthogonal segments.
function segmentClear(a, b, obstacles) {
  if (a.x === b.x) {
    const x = a.x;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    for (const r of obstacles) {
      if (x > r.x && x < r.x + r.w && y2 > r.y && y1 < r.y + r.h) return false;
    }
    return true;
  }
  if (a.y === b.y) {
    const y = a.y;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    for (const r of obstacles) {
      if (y > r.y && y < r.y + r.h && x2 > r.x && x1 < r.x + r.w) return false;
    }
    return true;
  }
  return false;
}

// Greedy shortcut: from each point, find the farthest later point
// reachable via a straight axis-aligned segment OR an L-shape (one
// right-angle corner) that clears every obstacle. Replace everything
// in between with at most one corner. Turns staircase output from A*
// into clean right-angle bends.
function shortcut(points, obstacles) {
  if (points.length <= 2) return points;
  const out = [];
  let i = 0;
  while (i < points.length) {
    out.push(points[i]);
    if (i >= points.length - 1) break;

    let bestJ = i + 1;
    let bestCorner = null;

    for (let j = points.length - 1; j > i + 1; j--) {
      const a = points[i];
      const b = points[j];

      // Straight axis-aligned shot?
      if ((a.x === b.x || a.y === b.y) && segmentClear(a, b, obstacles)) {
        bestJ = j; bestCorner = null; break;
      }

      // One-corner L-shape — try both possible corners, prefer neither
      // unless both work.
      const c1 = { x: b.x, y: a.y };
      const c2 = { x: a.x, y: b.y };
      const c1ok = segmentClear(a, c1, obstacles) && segmentClear(c1, b, obstacles);
      const c2ok = segmentClear(a, c2, obstacles) && segmentClear(c2, b, obstacles);
      if (c1ok || c2ok) {
        bestJ = j;
        bestCorner = c1ok ? c1 : c2;
        break;
      }
    }

    if (bestCorner) out.push(bestCorner);
    i = bestJ;
  }
  return out;
}

// Collapse collinear runs: three points a,b,c are collinear if they
// share the same x (vertical) or the same y (horizontal). b is then
// redundant.
function simplify(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const straight = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!straight) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function polyline(points) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

// ---- Warning edge when no route can be found ----

function renderWarning(id, sa, ta, _style, markerEnd) {
  // Draw a deliberately ugly dashed red L-shape so the author notices.
  const corner = { x: ta.x, y: sa.y };
  const d = polyline([sa, corner, ta]);
  return (
    <>
      <path
        id={id}
        d={d}
        fill="none"
        style={{ stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: '3 4', opacity: 0.85 }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div className="react-flow__edge-label-floating edge-warning"
          style={{ transform: `translate(-50%, -50%) translate(${corner.x}px, ${corner.y}px)` }}>
          ⚠︎ no route — add space
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
