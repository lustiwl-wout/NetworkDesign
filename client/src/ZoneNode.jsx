import { useLayoutEffect, useRef, useState } from 'react';
import { NodeResizer } from '@reactflow/node-resizer';
import { Handle, Position } from 'reactflow';
import '@reactflow/node-resizer/dist/style.css';

const DEFAULT_COLOR = '#38bdf8';

const SIDES = [
  { id: 't', pos: Position.Top },
  { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom },
  { id: 'l', pos: Position.Left },
];

export default function ZoneNode({ data, selected }) {
  const color = data?.color ?? DEFAULT_COLOR;
  const label = data?.label ?? 'Zone';
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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

      {SIDES.map((s) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={s.pos}
          className="zone-handle"
          style={{ background: color, borderColor: '#e2e8f0' }}
          isConnectable
        />
      ))}

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
