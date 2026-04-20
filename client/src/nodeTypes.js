export const NODE_CATALOG = [
  { type: 'router',   label: 'Router',   icon: 'R' },
  { type: 'switch',   label: 'Switch',   icon: 'S' },
  { type: 'firewall', label: 'Firewall', icon: 'F' },
  { type: 'server',   label: 'Server',   icon: 'SV' },
  { type: 'client',   label: 'Client',   icon: 'C' },
  { type: 'cloud',    label: 'Cloud',    icon: 'CL' },
  { type: 'ap',       label: 'Access Point', icon: 'AP' },
  { type: 'database', label: 'Database', icon: 'DB' },
  { type: 'load-balancer', label: 'Load Balancer', icon: 'LB' },
];

export const CATALOG_BY_TYPE = Object.fromEntries(NODE_CATALOG.map((n) => [n.type, n]));
