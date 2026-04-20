import { useMemo } from 'react';
import { BaseEdge, useNodes, getSmoothStepPath, EdgeLabelRenderer } from 'reactflow';
import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  svgDrawStraightLinePath,
} from '@tisoap/react-flow-smart-edge';

// Custom smart edge that:
//   1. Only treats *device* nodes as obstacles. Zones and annotations are
//      intentionally transparent to the router so lines can pass through
//      their backgrounds but route around hardware icons.
//   2. Uses a generous nodePadding so lines never hug or cross device icons.
//   3. Falls back to smoothstep if the router can't find a path.
export default function SmartEdge(props) {
  const {
    id, source, target, sourcePosition, targetPosition,
    sourceX, sourceY, targetX, targetY, style = {}, markerEnd, label, data, animated,
  } = props;

  const nodes = useNodes();

  const obstacles = useMemo(() => {
    const abs = new Map();
    for (const n of nodes) {
      // Skip non-devices entirely.
      if (n.type !== 'device') continue;
      // Resolve to absolute position if parented to a zone.
      let x = n.position?.x ?? 0;
      let y = n.position?.y ?? 0;
      if (n.parentNode) {
        const parent = nodes.find((p) => p.id === n.parentNode);
        if (parent) { x += parent.position.x; y += parent.position.y; }
      }
      const w = n.width  ?? n.style?.width  ?? 170;
      const h = n.height ?? n.style?.height ?? 150;
      abs.set(n.id, { ...n, position: { x, y }, width: w, height: h, parentNode: undefined });
    }
    return [...abs.values()];
  }, [nodes]);

  const smart = getSmartEdge({
    sourcePosition, targetPosition,
    sourceX, sourceY, targetX, targetY,
    nodes: obstacles,
    options: {
      nodePadding: 24,
      gridRatio: 8,
      generatePath: pathfindingAStarNoDiagonal,
      drawEdge: svgDrawStraightLinePath,
    },
  });

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
