import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';

export const ZONE_PRESETS = {
  production:  { label: 'Production',  color: '#3b82f6' },
  dmz:         { label: 'DMZ',         color: '#f59e0b' },
  cloud:       { label: 'Cloud',       color: '#8b5cf6' },
  ire:         { label: 'Isolated Recovery Environment', color: '#22c55e' },
  airgap:      { label: 'Air Gap',     color: '#64748b' },
  branch:      { label: 'Branch',      color: '#06b6d4' },
  management:  { label: 'Management',  color: '#94a3b8' },
  generic:     { label: 'Zone',        color: '#38bdf8' },
};

export default function ZoneNode({ data, selected }) {
  const preset = ZONE_PRESETS[data?.preset] ?? ZONE_PRESETS.generic;
  const color = data?.color ?? preset.color;
  const label = data?.label ?? preset.label;

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
