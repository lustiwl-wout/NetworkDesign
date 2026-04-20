export const NODE_CATALOG = [
  { type: 'router',        label: 'Router',        defaultInputs: 2, defaultOutputs: 4 },
  { type: 'switch',        label: 'Switch',        defaultInputs: 1, defaultOutputs: 8 },
  { type: 'firewall',      label: 'Firewall',      defaultInputs: 1, defaultOutputs: 1 },
  { type: 'server',        label: 'Server',        defaultInputs: 1, defaultOutputs: 1 },
  { type: 'client',        label: 'Client',        defaultInputs: 1, defaultOutputs: 1 },
  { type: 'cloud',         label: 'Cloud',         defaultInputs: 1, defaultOutputs: 1 },
  { type: 'ap',            label: 'Access Point',  defaultInputs: 1, defaultOutputs: 4 },
  { type: 'database',      label: 'Database',      defaultInputs: 1, defaultOutputs: 0 },
  { type: 'load-balancer', label: 'Load Balancer', defaultInputs: 1, defaultOutputs: 4 },
];

export const CATALOG_BY_TYPE = Object.fromEntries(NODE_CATALOG.map((n) => [n.type, n]));
