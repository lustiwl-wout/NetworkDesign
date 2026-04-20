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
        color: '#f1f5f9',
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
        <div className="annotation-title" style={{ color }}>{data.title}</div>
      )}
      <div className="annotation-body">{text}</div>
    </div>
  );
}
