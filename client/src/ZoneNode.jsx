import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeResizer } from '@reactflow/node-resizer';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import '@reactflow/node-resizer/dist/style.css';

const DEFAULT_COLOR = '#38bdf8';

const SIDES = [
  { key: 't', pos: Position.Top,    along: 'left'  },
  { key: 'r', pos: Position.Right,  along: 'top'   },
  { key: 'b', pos: Position.Bottom, along: 'left'  },
  { key: 'l', pos: Position.Left,   along: 'top'   },
];

// Zones default to ZERO connection points per side — readers of a zone
// usually read the whole compartment, and connections are drawn
// explicitly through devices inside. Set a value > 0 in the inspector
// to expose drag-to-connect anchors on that side.
function sideCount(data, sideKey) {
  const n = data?.handles?.[sideKey];
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.floor(n), 12));
}

export default function ZoneNode({ id, data, selected }) {
  const color = data?.color ?? DEFAULT_COLOR;
  const label = data?.label ?? 'Zone';
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const updateNodeInternals = useUpdateNodeInternals();

  // Re-measure handles whenever the per-side counts change.
  const handlesKey = [
    data?.handles?.t ?? 0,
    data?.handles?.r ?? 0,
    data?.handles?.b ?? 0,
    data?.handles?.l ?? 0,
  ].join(',');
  useEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, handlesKey, updateNodeInternals]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`zone-node${selected ? ' selected' : ''}`}
      style={{
        borderColor: color,
        background: `${color}14`,
        boxShadow: selected ? `0 0 0 2px ${color}66` : undefined,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={140}
        lineStyle={{ borderColor: color }}
        handleStyle={{ background: color, width: 8, height: 8 }}
      />

      {SIDES.map(({ key, pos, along }) => {
        const n = sideCount(data, key);
        return Array.from({ length: n }, (_, i) => {
          const pct = ((i + 1) / (n + 1)) * 100;
          const handleStyle = { background: color, borderColor: '#e2e8f0' };
          handleStyle[along] = `${pct}%`;
          return (
            <Handle
              key={`${key}-${i}`}
              id={`${key}-${i}`}
              type="source"
              position={pos}
              className="zone-handle"
              style={handleStyle}
              isConnectable
            />
          );
        });
      })}

      <div className="zone-header" style={{ color, borderColor: color }}>
        <span className="zone-title">{label}</span>
        {data?.sublabel && <span className="zone-sub">{data.sublabel}</span>}
      </div>

      {selected && size.w > 0 && (
        <div className="size-chip size-chip--zone" style={{ borderColor: color, color }}>
          {Math.round(size.w)} × {Math.round(size.h)}
        </div>
      )}
    </div>
  );
}
