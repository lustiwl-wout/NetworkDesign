import { Handle, Position } from 'reactflow';
import { CATALOG_BY_TYPE } from './nodeTypes.js';

export default function NetworkNode({ data, type }) {
  const meta = CATALOG_BY_TYPE[type] ?? { icon: '?', label: type };
  return (
    <div className="net-node">
      <Handle type="target" position={Position.Top} />
      <span className="icon">{meta.icon}</span>
      <div className="label">{data?.label ?? meta.label}</div>
      {data?.ip && <div className="sub">{data.ip}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
