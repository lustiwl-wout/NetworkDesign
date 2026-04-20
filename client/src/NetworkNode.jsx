import { Handle, Position } from 'reactflow';
import DeviceIcon from './DeviceIcons.jsx';
import { CATALOG_BY_TYPE } from './nodeTypes.js';

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

function formatCurrency(n) {
  if (n == null || n === '') return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M/yr`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k/yr`;
  return `$${v}/yr`;
}

export default function NetworkNode({ data, type, selected }) {
  const meta = CATALOG_BY_TYPE[type] ?? { label: type, defaultInputs: 1, defaultOutputs: 1 };
  const inputs  = data?.inputs  ?? meta.defaultInputs;
  const outputs = data?.outputs ?? meta.defaultOutputs;
  const risk    = data?.risk;
  const cost    = formatCurrency(data?.costAnnual);

  return (
    <div className={`net-node${selected ? ' selected' : ''}`}>
      {risk && <span className="risk-dot" style={{ background: RISK_COLORS[risk] }} title={`Risk: ${risk}`} />}
      {data?.phase && <span className="phase-badge">{data.phase}</span>}

      {portOffsets(inputs).map((top, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
          style={{ top }}
          className="port-handle"
        />
      ))}

      <DeviceIcon type={type} size={44} />
      <div className="label">{data?.label ?? meta.label}</div>
      {data?.ip && <div className="sub">{data.ip}</div>}
      {data?.capacity && <div className="sub">{data.capacity}</div>}
      {cost && <div className="sub cost">{cost}</div>}

      {portOffsets(outputs).map((top, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${i}`}
          style={{ top }}
          className="port-handle"
        />
      ))}
    </div>
  );
}
