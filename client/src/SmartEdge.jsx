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
  // The router can't find a path if its start/end points sit inside a
  // walled-off node.
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

// --- Floating endpoint math (standard React Flow pattern) ---

function getFloatingEdgeParams(source, target) {
  const si = getNodeIntersection(source, target);
  const ti = getNodeIntersection(target, source);
  return {
    sx: si.x,
    sy: si.y,
    tx: ti.x,
    ty: ti.y,
    sourcePosition: getEdgePosition(source, si),
    targetPosition: getEdgePosition(target, ti),
  };
}

function getNodeIntersection(source, target) {
  const sp = source.positionAbsolute ?? source.position;
  const tp = target.positionAbsolute ?? target.position;
  const w = (source.width ?? 170) / 2;
  const h = (source.height ?? 150) / 2;
  const x2 = sp.x + w;
  const y2 = sp.y + h;
  const x1 = tp.x + (target.width ?? 170) / 2;
  const y1 = tp.y + (target.height ?? 150) / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function getEdgePosition(node, point) {
  const np = node.positionAbsolute ?? node.position;
  const nx = Math.round(np.x);
  const ny = Math.round(np.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const w = node.width ?? 170;
  const h = node.height ?? 150;

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + w - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + h - 1) return Position.Bottom;
  return Position.Top;
}
