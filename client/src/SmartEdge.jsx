import { useMemo } from 'react';
import { BaseEdge, useNodes, getSmoothStepPath, EdgeLabelRenderer } from 'reactflow';
import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  svgDrawSmoothLinePath,
} from '@tisoap/react-flow-smart-edge';

// Custom smart edge that routes around device icons.
// - Zones and annotations are NOT obstacles — lines pass over their
//   backgrounds freely.
// - Uses each node's positionAbsolute so parented devices are placed
//   correctly on the obstacle grid.
// - Generous padding so edges never hug device icons.
export default function SmartEdge(props) {
  const {
    id, sourcePosition, targetPosition,
    sourceX, sourceY, targetX, targetY, style = {}, markerEnd, label, animated,
  } = props;

  const nodes = useNodes();

  const obstacles = useMemo(
    () =>
      nodes
        .filter((n) => n.type === 'device' && n.width && n.height)
        .map((n) => ({
          ...n,
          // positionAbsolute is set by React Flow even when the node has a parent.
          position: n.positionAbsolute ?? n.position,
          parentNode: undefined,
        })),
    [nodes]
  );

  const smart = getSmartEdge({
    sourcePosition, targetPosition,
    sourceX, sourceY, targetX, targetY,
    nodes: obstacles,
    options: {
      nodePadding: 28,
      gridRatio: 6,
      generatePath: pathfindingAStarNoDiagonal,
      drawEdge: svgDrawSmoothLinePath,
    },
  });

  // Fallback: if A* fails (e.g. nodes not yet measured), draw a smoothstep path.
  if (smart === null) {
    const [p, lx, ly] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition, borderRadius: 12,
    });
    return (
      <>
        <BaseEdge id={id} path={p} style={style} markerEnd={markerEnd} />
        {label && (
          <EdgeLabelRenderer>
            <div className="react-flow__edge-label-floating"
              style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
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
