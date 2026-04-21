import { useNodes, useEdges, useStore } from 'reactflow';

const selectTransform = (s) => s.transform;

// Debug overlay — shows exactly what the SmartEdge router sees plus the
// z-stacking reality. Toggle with the "Debug" button in the topbar.
//
// Paints (all in flow coordinates, panning/zooming with the canvas):
//   - Zone bounding boxes (dashed outline, faint) with id + coords
//   - Device bounding boxes (solid red) with id + abs coords + w×h
//   - Device OBSTACLE padding rings (the "no-go" zone the router uses)
//   - Each edge's endpoint anchor coords
// Plus a fixed-position HUD in the corner with totals + warnings.

const OBSTACLE_PAD = 14; // must match SmartEdge.OBSTACLE_PAD

export default function DebugOverlay() {
  const nodes = useNodes();
  const edges = useEdges();
  const [tx, ty, zoom] = useStore(selectTransform);

  const zones = nodes.filter((n) => n.type === 'zone');
  const devices = nodes.filter((n) => n.type === 'device');

  const measuredDevices = devices.filter((n) => n.width && n.height);
  const unmeasured = devices.length - measuredDevices.length;

  // naive edge/device overlap check: does any edge endpoint sit inside
  // a device bounding box that isn't its own source/target?
  const crossings = [];
  for (const e of edges) {
    for (const d of measuredDevices) {
      if (d.id === e.source || d.id === e.target) continue;
      const p = d.positionAbsolute ?? d.position;
      const x1 = p.x, y1 = p.y;
      const x2 = p.x + d.width, y2 = p.y + d.height;
      // We don't have the raw path here; this is a weak heuristic against
      // the straight line between source and target anchors.
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const sp = s.positionAbsolute ?? s.position;
      const tp = t.positionAbsolute ?? t.position;
      const sx = sp.x + (s.width ?? 0) / 2;
      const sy = sp.y + (s.height ?? 0) / 2;
      const tx = tp.x + (t.width ?? 0) / 2;
      const ty = tp.y + (t.height ?? 0) / 2;
      if (segmentIntersectsRect(sx, sy, tx, ty, x1, y1, x2, y2)) {
        crossings.push({ edge: e.id, device: d.id });
      }
    }
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <svg
          style={{ overflow: 'visible' }}
          width="1" height="1"
        >
          {zones.map((z) => {
            const w = z.width ?? z.style?.width ?? 0;
            const h = z.height ?? z.style?.height ?? 0;
            return (
              <g key={`z-${z.id}`}>
                <rect
                  x={z.position.x} y={z.position.y} width={w} height={h}
                  fill="none" stroke="#38bdf8" strokeWidth="1"
                  strokeDasharray="6 4" opacity="0.6"
                />
                <text x={z.position.x + 4} y={z.position.y - 4}
                  fill="#38bdf8" fontSize="10" fontFamily="ui-monospace, monospace">
                  zone:{z.id} ({Math.round(z.position.x)},{Math.round(z.position.y)}) {Math.round(w)}×{Math.round(h)}
                </text>
              </g>
            );
          })}

          {devices.map((d) => {
            const p = d.positionAbsolute ?? d.position;
            const w = d.width ?? 170;
            const h = d.height ?? 150;
            const measured = !!(d.width && d.height);
            return (
              <g key={`d-${d.id}`}>
                {/* Obstacle ring */}
                <rect
                  x={p.x - OBSTACLE_PAD} y={p.y - OBSTACLE_PAD}
                  width={w + OBSTACLE_PAD * 2}
                  height={h + OBSTACLE_PAD * 2}
                  fill="none" stroke="#fde047" strokeWidth="1"
                  strokeDasharray="2 3" opacity="0.7"
                />
                {/* Node bbox */}
                <rect
                  x={p.x} y={p.y} width={w} height={h}
                  fill="none" stroke={measured ? '#ef4444' : '#f97316'}
                  strokeWidth="1.5"
                />
                <text x={p.x} y={p.y - 4}
                  fill={measured ? '#ef4444' : '#f97316'}
                  fontSize="10" fontFamily="ui-monospace, monospace">
                  {d.id}{d.parentNode ? ` ↖${d.parentNode}` : ''}
                  {' '}({Math.round(p.x)},{Math.round(p.y)}){measured ? '' : ' UNMEASURED'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="debug-hud">
        <div className="debug-hud-title">Debug</div>
        <div className="debug-row"><span>Devices</span><strong>{devices.length}</strong></div>
        <div className="debug-row"><span>Unmeasured</span><strong style={{ color: unmeasured ? '#f97316' : '#94a3b8' }}>{unmeasured}</strong></div>
        <div className="debug-row"><span>Zones</span><strong>{zones.length}</strong></div>
        <div className="debug-row"><span>Edges</span><strong>{edges.length}</strong></div>
        <div className="debug-row"><span>Likely crossings</span><strong style={{ color: crossings.length ? '#ef4444' : '#22c55e' }}>{crossings.length}</strong></div>
        <div className="debug-legend">
          <span style={{ color: '#ef4444' }}>■</span> device bbox ·
          <span style={{ color: '#fde047' }}> ▪</span> obstacle ring ·
          <span style={{ color: '#38bdf8' }}> ▫</span> zone
        </div>
        {crossings.length > 0 && (
          <details>
            <summary>{crossings.length} overlaps</summary>
            <ul>
              {crossings.slice(0, 20).map((c, i) => (
                <li key={i}>edge <code>{c.edge}</code> ↔ device <code>{c.device}</code></li>
              ))}
              {crossings.length > 20 && <li>… and {crossings.length - 20} more</li>}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}

// Liang–Barsky-ish segment-vs-AABB intersection
function segmentIntersectsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2) {
  if ((x1 >= rx1 && x1 <= rx2 && y1 >= ry1 && y1 <= ry2) ||
      (x2 >= rx1 && x2 <= rx2 && y2 >= ry1 && y2 <= ry2)) return true;
  const edges = [
    [rx1, ry1, rx2, ry1],
    [rx2, ry1, rx2, ry2],
    [rx2, ry2, rx1, ry2],
    [rx1, ry2, rx1, ry1],
  ];
  for (const [a, b, c, d] of edges) {
    if (segmentsIntersect(x1, y1, x2, y2, a, b, c, d)) return true;
  }
  return false;
}
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
  const d2 = cross(dx - cx, dy - cy, bx - cx, by - cy);
  const d3 = cross(bx - ax, by - ay, cx - ax, cy - ay);
  const d4 = cross(bx - ax, by - ay, dx - ax, dy - ay);
  return (d1 > 0 ? d2 < 0 : d2 > 0) && (d3 > 0 ? d4 < 0 : d4 > 0);
}
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
