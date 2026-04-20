import { Handle, Position } from 'reactflow';
import DeviceIcon from './DeviceIcons.jsx';
import { CATALOG_BY_TYPE } from './nodeTypes.js';

const HANDLE_STYLE = {
  width: 10,
  height: 10,
  background: '#0ea5e9',
  border: '2px solid #e2e8f0',
};

function portOffsets(count) {
  if (count <= 0) return [];
  if (count === 1) return ['50%'];
  const step = 100 / (count + 1);
  return Array.from({ length: count }, (_, i) => `${step * (i + 1)}%`);
}

export default function NetworkNode({ data, type }) {
  const meta = CATALOG_BY_TYPE[type] ?? { label: type, defaultInputs: 1, defaultOutputs: 1 };
  const inputs  = data?.inputs  ?? meta.defaultInputs;
  const outputs = data?.outputs ?? meta.defaultOutputs;

  return (
    <div className="net-node">
      {portOffsets(inputs).map((top, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
          style={{ ...HANDLE_STYLE, top }}
        />
      ))}

      <DeviceIcon type={type} size={48} />
      <div className="label">{data?.label ?? meta.label}</div>
      {data?.ip && <div className="sub">{data.ip}</div>}
      <div className="sub ports">
        {inputs} in · {outputs} out
      </div>

      {portOffsets(outputs).map((top, i) => (
        <Handle
          key={`out-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${i}`}
          style={{ ...HANDLE_STYLE, top }}
        />
      ))}
    </div>
  );
}
