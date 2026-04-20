import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';

const DEFAULT_COLOR = '#38bdf8';

export default function ZoneNode({ data, selected }) {
  const color = data?.color ?? DEFAULT_COLOR;
  const label = data?.label ?? 'Zone';

  return (
    <div
      className={`zone-node${selected ? ' selected' : ''}`}
      style={{
        borderColor: color,
        background: `${color}14`,
        boxShadow: selected ? `0 0 0 2px ${color}66` : undefined,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        lineStyle={{ borderColor: color }}
        handleStyle={{ background: color, width: 8, height: 8 }}
      />
      <div className="zone-header" style={{ color, borderColor: color }}>
        <span className="zone-title">{label}</span>
        {data?.sublabel && <span className="zone-sub">{data.sublabel}</span>}
      </div>
    </div>
  );
}
