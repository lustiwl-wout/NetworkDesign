export const EDGE_KINDS = [
  {
    key: 'network',
    label: 'Network link',
    description: 'Standard physical or logical network connection.',
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    animated: false,
  },
  {
    key: 'management',
    label: 'Management / OOB',
    description: 'Out-of-band administrative or control-plane link.',
    style: { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1.5 },
    animated: false,
  },
  {
    key: 'logs',
    label: 'Log / telemetry',
    description: 'One-way forward of logs or telemetry (e.g., to SIEM).',
    style: { stroke: '#a78bfa', strokeDasharray: '4 4', strokeWidth: 1.5 },
    animated: false,
  },
  {
    key: 'replication',
    label: 'Data replication',
    description: 'Active data movement. Animated to signal live flow.',
    style: { stroke: '#22c55e', strokeDasharray: '6 4', strokeWidth: 2 },
    animated: true,
  },
  {
    key: 'wan',
    label: 'WAN / Internet',
    description: 'Wide-area / public Internet link.',
    style: { stroke: '#38bdf8', strokeWidth: 2.5 },
    animated: false,
  },
  {
    key: 'planned',
    label: 'Planned / future',
    description: 'Proposed future connection, not yet in place.',
    style: { stroke: '#64748b', strokeDasharray: '2 6', strokeWidth: 1.5, opacity: 0.7 },
    animated: false,
  },
];

export const EDGE_KINDS_BY_KEY = Object.fromEntries(EDGE_KINDS.map((k) => [k.key, k]));

export function applyKind(edge, kindKey) {
  const kind = EDGE_KINDS_BY_KEY[kindKey] ?? EDGE_KINDS_BY_KEY.network;
  return {
    ...edge,
    data: { ...(edge.data ?? {}), kind: kindKey },
    style: { ...kind.style },
    animated: kind.animated,
  };
}
