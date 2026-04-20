import { useMemo } from 'react';
import { BaseEdge, useStore, getSmoothStepPath, EdgeLabelRenderer, Position } from 'reactflow';
import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  svgDrawSmoothLinePath,
} from '@tisoap/react-flow-smart-edge';

// Floating smart edge:
//   1. Endpoints float to the closest side of each device (we ignore any
//      sourceHandle / targetHandle on the edge). Devices can therefore
//      connect from any side without the author picking a port.
//   2. Routes around *device* obstacles only — zones and annotations
//      are transparent to the router.
//   3. Generous nodePadding so paths don't hug device icons.

const OBSTACLE_PAD = 28;

const selectNodes = (s) => s.nodeInternals;

export default function SmartEdge(props) {
  const { id, source, target, style = {}, markerEnd, label, animated } = props;

  const nodeInternals = useStore(selectNodes);

  const sourceNode = nodeInternals.get(source);
  const targetNode = nodeInternals.get(target);

  const obstacles = useMemo(() => {
    const list = [];
    for (const n of nodeInternals.values()) {
      if (n.type !== 'device') continue;
      if (!n.width || !n.height) continue;
      const p = n.positionAbsolute ?? n.position;
      list.push({
        ...n,
        position: p,
        parentNode: undefined,
      });
    }
    return list;
  }, [nodeInternals]);

  // If either node isn't yet in the store (initial frame), don't render —
  // React Flow will re-render once they're available.
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePosition, targetPosition } =
    getFloatingEdgeParams(sourceNode, targetNode);

  const smart = getSmartEdge({
    sourcePosition, targetPosition,
    sourceX: sx, sourceY: sy, targetX: tx, targetY: ty,
    nodes: obstacles,
    options: {
      nodePadding: OBSTACLE_PAD,
      gridRatio: 6,
      generatePath: pathfindingAStarNoDiagonal,
      drawEdge: svgDrawSmoothLinePath,
    },
  });

  // Fallback: smoothstep if the router fails
  const path = smart?.svgPathString ??
    getSmoothStepPath({
      sourceX: sx, sourceY: sy, targetX: tx, targetY: ty,
      sourcePosition, targetPosition, borderRadius: 12,
    })[0];
  const labelX = smart?.edgeCenterX ?? (sx + tx) / 2;
  const labelY = smart?.edgeCenterY ?? (sy + ty) / 2;

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        className={`react-flow__edge-path${animated ? ' animated' : ''}`}
        style={style}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div className="react-flow__edge-label-floating"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
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

// Intersection of the line from `source` centre to `target` centre with
// `source`'s bounding rectangle. Returns the point on `source`'s border.
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
