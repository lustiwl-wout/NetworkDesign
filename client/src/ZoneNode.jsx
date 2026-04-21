import { NodeResizer } from '@reactflow/node-resizer';
import { Handle, Position } from 'reactflow';
import '@reactflow/node-resizer/dist/style.css';

const DEFAULT_COLOR = '#38bdf8';

// Four anchor points on the zone's perimeter so network devices can
// connect to the zone as a whole (edges route to whichever side of the
// zone is closest). Workloads inside the zone don't need their own
// external connections — the zone carries the traffic.
const SIDES = [
  { id: 't', pos: Position.Top },
  { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom },
  { id: 'l', pos: Position.Left },
];

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
    </div>
  );
}
