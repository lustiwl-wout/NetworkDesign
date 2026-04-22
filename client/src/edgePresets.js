// Edge kinds are loaded from /api/edge-kinds (admin-configurable).
// These fallbacks mirror the built-in seeds so the editor renders
// sensibly even before the API responds.

const FALLBACK = [
  { key: 'network',    label: 'Network link',     description: 'Standard physical or logical network connection.',         stroke: '#94a3b8', strokeWidth: 2,   strokeDasharray: null,     animated: false, curved: false },
  { key: 'management', label: 'Management / OOB', description: 'Out-of-band administrative or control-plane link.',        stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '4 4',    animated: false, curved: false },
  { key: 'logs',       label: 'Log / telemetry',  description: 'One-way forward of logs or telemetry (e.g., to SIEM).',    stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '4 4',    animated: false, curved: false },
  { key: 'replication',label: 'Data replication', description: 'Active data movement — curved so it reads as a separate path from a primary link.', stroke: '#22c55e', strokeWidth: 2,   strokeDasharray: '6 4',    animated: true,  curved: true  },
  { key: 'wan',        label: 'WAN / Internet',   description: 'Wide-area / public Internet link.',                        stroke: '#38bdf8', strokeWidth: 2.5, strokeDasharray: null,     animated: false, curved: false },
  { key: 'planned',    label: 'Planned / future', description: 'Proposed future connection, not yet in place.',            stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '2 6',    animated: false, curved: false },
  { key: 'redundant',  label: 'Redundant / backup', description: 'Parallel or failover path — curved so it bows off the primary link for visibility.', stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '8 4', animated: false, curved: true  },
];

let _kinds = FALLBACK.slice();
let _byKey = Object.fromEntries(_kinds.map((k) => [k.key, k]));

export function setEdgeKinds(kinds) {
  if (!Array.isArray(kinds) || !kinds.length) return;
  _kinds = kinds;
  _byKey = Object.fromEntries(kinds.map((k) => [k.key, k]));
}

// Plain getters — prefer these over a Proxy in JSX: the module stays a
// regular object, no engine-specific weirdness with Array.prototype on
// a Proxy target.
export function getEdgeKinds() { return _kinds; }
export function getEdgeKind(key) {
  return _byKey[key] ?? _byKey.network ?? FALLBACK[0];
}
export const EDGE_FALLBACK = FALLBACK;

function styleFromKind(k) {
  const style = { stroke: k.stroke, strokeWidth: k.strokeWidth ?? 2 };
  if (k.strokeDasharray) style.strokeDasharray = k.strokeDasharray;
  return style;
}

export function applyKind(edge, kindKey) {
  const kind = getEdgeKind(kindKey);
  return {
    ...edge,
    data: { ...(edge.data ?? {}), kind: kindKey, curved: !!kind.curved },
    style: styleFromKind(kind),
    animated: !!kind.animated,
  };
}
