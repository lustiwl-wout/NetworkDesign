import { useMemo } from 'react';
import { useStore, getSmoothStepPath, EdgeLabelRenderer, Position } from 'reactflow';
import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  svgDrawStraightLinePath,
} from '@tisoap/react-flow-smart-edge';

// Strict orthogonal routing:
//   - Endpoints float to the closest side of each device.
//   - Every OTHER device is a hard obstacle with a padding ring. A*
//     routes around them on an orthogonal grid.
//   - If no route can be found (layout too tight), we draw a visibly
//     broken warning edge instead of silently cutting through a device.
//   - Zones and annotations are transparent to the router.

const OBSTACLE_PAD = 30;
const GRID_RATIO = 4;

const selectNodes = (s) => s.nodeInternals;

export default function SmartEdge(props) {
  const { id, source, target, style = {}, markerEnd, label, animated } = props;

  const nodeInternals = useStore(selectNodes);

  const sourceNode = nodeInternals.get(source);
  const targetNode = nodeInternals.get(target);

  // Obstacles: every measured device EXCEPT the edge's own endpoints.
  // Zones are NOT obstacles — they're containers, and lines should pass
  // freely over zone backgrounds. Workloads inside zones are still
  // obstacles, so routing avoids those.
  const obstacles = useMemo(() => {
    const list = [];
    for (const n of nodeInternals.values()) {
      if (n.type !== 'device') continue;
      if (n.id === source || n.id === target) continue;
      if (!n.width || !n.height) continue;
      const p = n.positionAbsolute ?? n.position;
      list.push({ ...n, position: p, parentNode: undefined });
    }
    return list;
  }, [nodeInternals, source, target]);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePosition, targetPosition } =
    getFloatingEdgeParams(sourceNode, targetNode);

  const smart = getSmartEdge({
    sourcePosition, targetPosition,
    sourceX: sx, sourceY: sy, targetX: tx, targetY: ty,
    nodes: obstacles,
    options: {
      nodePadding: OBSTACLE_PAD,
      gridRatio: GRID_RATIO,
      generatePath: pathfindingAStarNoDiagonal,
      drawEdge: svgDrawStraightLinePath,
    },
  });

  // Routing failed — show a clearly broken edge so the user knows the
  // layout needs more room, instead of silently cutting through devices.
  if (smart === null) {
    const [p, lx, ly] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, targetX: tx, targetY: ty,
      sourcePosition, targetPosition, borderRadius: 8,
    });
    return (
      <>
        <path
          id={id}
          d={p}
          fill="none"
          style={{
            ...style,
            stroke: '#ef4444',
            strokeWidth: 1.5,
            strokeDasharray: '2 4',
            opacity: 0.8,
          }}
          markerEnd={markerEnd}
        />
        <EdgeLabelRenderer>
          <div className="react-flow__edge-label-floating edge-warning"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            ⚠︎ no route — add space between devices
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }

  const { svgPathString, edgeCenterX, edgeCenterY } = smart;

  return (
    <>
      <path
        id={id}
        d={svgPathString}
        fill="none"
        className={`react-flow__edge-path${animated ? ' animated' : ''}`}
        style={style}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div className="react-flow__edge-label-floating"
            style={{ transform: `translate(-50%, -50%) translate(${edgeCenterX}px, ${edgeCenterY}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// --- Floating endpoint math ---
// Snap to the MIDPOINT of whichever side of the node faces the other
// endpoint. Anchoring on side-midpoints guarantees that the first and
// last segment of the path are perpendicular to the node's side — i.e.
// purely horizontal or purely vertical. Combined with A*-no-diagonal,
// the whole edge is orthogonal: straight segments with right-angle
// corners, never diagonals.

function getFloatingEdgeParams(source, target) {
  const si = getSideAnchor(source, target);
  const ti = getSideAnchor(target, source);
  return {
    sx: si.x,
    sy: si.y,
    tx: ti.x,
    ty: ti.y,
    sourcePosition: si.side,
    targetPosition: ti.side,
  };
}

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

  // Compare normalised magnitudes (aspect-aware) to pick dominant axis.
  if (Math.abs(dx) * h >= Math.abs(dy) * w) {
    // Horizontal side
    return dx >= 0
      ? { x: sp.x + w, y: scy, side: Position.Right }
      : { x: sp.x,     y: scy, side: Position.Left };
  }
  // Vertical side
  return dy >= 0
    ? { x: scx, y: sp.y + h, side: Position.Bottom }
    : { x: scx, y: sp.y,     side: Position.Top };
}
