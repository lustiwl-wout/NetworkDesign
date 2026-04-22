import { NodeResizer } from '@reactflow/node-resizer';

const DEFAULT_COLOR = '#facc15';

export default function AnnotationNode({ data, selected }) {
  const color = data?.color ?? DEFAULT_COLOR;
  const text = data?.text ?? 'Double-click to edit';
  const variant = data?.variant ?? 'callout'; // 'callout' | 'note'

  const borderStyle = variant === 'note' ? 'solid' : 'dashed';

  return (
    <div
      className={`annotation-node variant-${variant}${selected ? ' selected' : ''}`}
      style={{
        borderColor: color,
        borderStyle,
        background: `${color}14`,
        // Always use the theme's text colour — the variant colour is
        // already the border, and the tinted background plus dashed/
        // solid border carry the "note / callout / warning / success"
        // signal without relying on coloured text that's invisible on
        // the matching pale fill.
        color: 'var(--text)',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={40}
        lineStyle={{ borderColor: color }}
        handleStyle={{ background: color, width: 8, height: 8 }}
      />
      {data?.title && (
        <div className="annotation-title">{data.title}</div>
      )}
      <div className="annotation-body">{text}</div>
    </div>
  );
}
