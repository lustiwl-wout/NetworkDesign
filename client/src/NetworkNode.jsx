import { Handle, Position } from 'reactflow';
import DeviceIcon, { iconAccent } from './DeviceIcons.jsx';

const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

function portOffsets(count) {
  if (count <= 0) return [];
  if (count === 1) return ['50%'];
  const step = 100 / (count + 1);
  return Array.from({ length: count }, (_, i) => `${step * (i + 1)}%`);
}

export default function NetworkNode({ data, selected }) {
  const iconKey = data?.iconKey ?? 'generic';
  const inputs  = data?.inputs  ?? 1;
  const outputs = data?.outputs ?? 1;
  const risk    = data?.risk;
  const accent  = iconAccent(iconKey);

  const style = {
    borderColor: selected ? accent : `${accent}55`,
    background: `linear-gradient(180deg, ${accent}1f 0%, ${accent}0a 60%, transparent 100%), #1e293b`,
    boxShadow: selected
      ? `0 0 0 2px ${accent}66, 0 4px 14px rgba(0,0,0,0.45)`
      : `0 3px 10px rgba(0,0,0,0.35)`,
  };

  return (
    <div className={`net-node${selected ? ' selected' : ''}`} style={style}>
      {risk && <span className="risk-dot" style={{ background: RISK_COLORS[risk] }} title={`Risk: ${risk}`} />}
      {data?.phase && (
        <span className="phase-badge" style={{ borderColor: `${accent}88`, color: accent }}>
          {data.phase}
        </span>
      )}

      {portOffsets(inputs).map((top, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
          style={{ top, background: accent, borderColor: '#e2e8f0' }}
          className="port-handle"
        />
      ))}

      <div className="icon-wrap"><DeviceIcon iconKey={iconKey} size={72} /></div>
      <div className="label">{data?.label ?? 'Device'}</div>
      {data?.capacity && <div className="sub">{data.capacity}</div>}

      {portOffsets(outputs).map((top, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${i}`}
          style={{ top, background: accent, borderColor: '#e2e8f0' }}
          className="port-handle"
        />
      ))}
    </div>
  );
}
