import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import DeviceIcon, { iconAccent } from './DeviceIcons.jsx';

const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

const SIDES = [
  { id: 't', pos: Position.Top },
  { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom },
  { id: 'l', pos: Position.Left },
];

export default function NetworkNode({ data, selected }) {
  const iconKey = data?.iconKey ?? 'generic';
  const risk = data?.risk;
  const accent = iconAccent(iconKey);
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

  const style = {
    borderColor: selected ? accent : `${accent}55`,
    background: `linear-gradient(180deg, ${accent}1f 0%, ${accent}0a 60%, transparent 100%), var(--node-bg)`,
    boxShadow: selected
      ? `0 0 0 2px ${accent}66, 0 4px 14px rgba(0,0,0,0.45)`
      : `0 3px 10px rgba(0,0,0,0.35)`,
  };

  return (
    <div ref={ref} className={`net-node${selected ? ' selected' : ''}`} style={style}>
      {risk && <span className="risk-dot" style={{ background: RISK_COLORS[risk] }} title={`Risk: ${risk}`} />}
      {data?.phase && (
        <span className="phase-badge" style={{ borderColor: `${accent}88`, color: accent }}>
          {data.phase}
        </span>
      )}

      {SIDES.map((s) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={s.pos}
          className="port-handle"
          style={{ background: accent, borderColor: '#e2e8f0' }}
          isConnectable
        />
      ))}

      <div className="icon-wrap"><DeviceIcon iconKey={iconKey} size={72} /></div>
      <div className="label">{data?.label ?? 'Device'}</div>
      {data?.capacity && <div className="sub">{data.capacity}</div>}

      <div className="engineering-only sub-tech">
        {data?.hostname && <div>{data.hostname}</div>}
        {data?.ip       && <div>{data.ip}</div>}
        {data?.vlan     && <div>VLAN {data.vlan}</div>}
        {data?.model    && <div>{data.model}</div>}
      </div>

      {selected && size.w > 0 && (
        <div className="size-chip" style={{ borderColor: accent, color: accent }}>
          {Math.round(size.w)} × {Math.round(size.h)}
        </div>
      )}
    </div>
  );
}
