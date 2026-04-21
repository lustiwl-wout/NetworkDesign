import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import DeviceIcon, { iconAccent } from './DeviceIcons.jsx';

const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

// Side definitions: which React Flow Position each belongs to, and
// which axis the handle is distributed along. 'along' is the dimension
// that we divide into N slots; 'perp' is where the handle sits on the
// other axis (0% = far edge, 100% = near edge, but React Flow handles
// this by Position).
const SIDES = [
  { key: 't', pos: Position.Top,    along: 'left'  },
  { key: 'r', pos: Position.Right,  along: 'top'   },
  { key: 'b', pos: Position.Bottom, along: 'left'  },
  { key: 'l', pos: Position.Left,   along: 'top'   },
];

function sideCount(data, sideKey) {
  const n = data?.handles?.[sideKey];
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 12) : 1;
}

export default function NetworkNode({ id, data, selected }) {
  const iconKey = data?.iconKey ?? 'generic';
  const risk = data?.risk;
  const accent = iconAccent(iconKey);
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const updateNodeInternals = useUpdateNodeInternals();

  // When handle counts change, force React Flow to re-measure this
  // node's handles — otherwise the internal handle cache stays stuck
  // at the count from mount, and newly added handles can't register
  // as valid connection endpoints.
  const handlesKey = [
    data?.handles?.t ?? 1,
    data?.handles?.r ?? 1,
    data?.handles?.b ?? 1,
    data?.handles?.l ?? 1,
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

      {SIDES.map(({ key, pos, along }) => {
        const n = sideCount(data, key);
        return Array.from({ length: n }, (_, i) => {
          const pct = ((i + 1) / (n + 1)) * 100;
          const handleStyle = { background: accent, borderColor: '#e2e8f0' };
          handleStyle[along] = `${pct}%`;
          return (
            <Handle
              key={`${key}-${i}`}
              id={`${key}-${i}`}
              type="source"
              position={pos}
              className="port-handle"
              style={handleStyle}
              isConnectable
            />
          );
        });
      })}

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
