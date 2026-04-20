const device = (id, iconKey, x, y, data = {}) => ({
  id,
  type: 'device',
  position: { x, y },
  data: { iconKey, inputs: 1, outputs: 1, ...data },
});

const zone = (id, x, y, width, height, data) => ({
  id,
  type: 'zone',
  position: { x, y },
  style: { width, height },
  data,
});

const edge = (id, source, target, kind = 'network', extras = {}) => ({
  id,
  source,
  target,
  sourceHandle: 'out-0',
  targetHandle: 'in-0',
  data: { kind },
  ...extras,
});

export default {
  id: 'isolated-recovery-environment',
  name: 'Isolated Recovery Environment (IRE)',
  description:
    'Cyber-resilient recovery architecture: production replicates one-way into an air-gapped vault containing immutable backups, a clean-room recovery environment, and forensic tooling. Aligns with NIST SP 800-209 and Sheltered Harbor guidance.',
  graph: {
    nodes: [
      zone('zone-prod',   0,   0, 520, 420, { color: '#3b82f6', label: 'Production',                    sublabel: 'Live business services' }),
      zone('zone-airgap', 560, 60, 220, 320, { color: '#64748b', label: 'Air Gap',                       sublabel: 'One-way replication, scheduled' }),
      zone('zone-ire',    820,  0, 620, 520, { color: '#22c55e', label: 'Isolated Recovery Environment', sublabel: 'Immutable · Air-gapped · Clean room' }),
      zone('zone-mgmt',   820, 540, 620, 140, { color: '#94a3b8', label: 'Out-of-Band Management' }),

      device('prod-db',     'database', 60,  70, { label: 'Production DB',     capacity: '40 TB',              risk: 'high',   phase: 'Current', inputs: 2, outputs: 1 }),
      device('prod-app',    'server',   220, 70, { label: 'Application Tier', capacity: '120 VMs',            risk: 'medium', phase: 'Current', inputs: 1, outputs: 1 }),
      device('prod-sw',     'switch',   140, 200,{ label: 'Core Switch',                                      risk: 'medium', phase: 'Current', inputs: 4, outputs: 4 }),
      device('prod-backup', 'server',   340, 200,{ label: 'Backup Source',    capacity: 'Proxy / media srv',  risk: 'medium', phase: 'Current', inputs: 1, outputs: 1 }),
      device('prod-fw',     'firewall', 220, 320,{ label: 'Perimeter Firewall',                              risk: 'medium', phase: 'Current', inputs: 1, outputs: 1 }),

      device('ire-fw',       'firewall', 880, 70,  { label: 'Vault Firewall',        capacity: 'Ingress-only, allow-list', risk: 'low', phase: 'Proposed', inputs: 1, outputs: 1 }),
      device('ire-sw',       'switch',   1050, 200,{ label: 'Vault Switch',          capacity: 'Isolated VLAN',            risk: 'low', phase: 'Proposed', inputs: 2, outputs: 4 }),
      device('ire-vault',    'database', 880, 320, { label: 'Immutable Backup Vault', capacity: '500 TB · Object Lock',     risk: 'low', phase: 'Proposed', inputs: 1, outputs: 0 }),
      device('ire-recovery', 'server',   1060, 320,{ label: 'Clean-room Recovery',    capacity: '8 restore VMs',            risk: 'low', phase: 'Proposed', inputs: 1, outputs: 1 }),
      device('ire-forensic', 'client',   1240, 320,{ label: 'Forensic Workstation',   capacity: 'Malware analysis',         risk: 'low', phase: 'Proposed', inputs: 1, outputs: 0 }),

      device('mgmt-jump', 'server', 900,  580, { label: 'Jump Host (OOB)',  capacity: 'MFA · PAM',      risk: 'low', phase: 'Proposed', inputs: 1, outputs: 1 }),
      device('mgmt-siem', 'server', 1120, 580, { label: 'SIEM Forwarder',   capacity: 'Read-only logs', risk: 'low', phase: 'Proposed', inputs: 1, outputs: 1 }),
    ],
    edges: [
      edge('e1', 'prod-db',     'prod-sw',     'network'),
      edge('e2', 'prod-app',    'prod-sw',     'network'),
      edge('e3', 'prod-sw',     'prod-backup', 'network'),
      edge('e4', 'prod-sw',     'prod-fw',     'network'),

      edge('e-airgap', 'prod-backup', 'ire-fw', 'replication', { label: 'One-way replication' }),

      edge('e5', 'ire-fw', 'ire-sw',       'network'),
      edge('e6', 'ire-sw', 'ire-vault',    'network'),
      edge('e7', 'ire-sw', 'ire-recovery', 'network'),
      edge('e8', 'ire-sw', 'ire-forensic', 'network'),

      edge('e9',  'mgmt-jump', 'ire-sw', 'management', { label: 'Admin' }),
      edge('e10', 'mgmt-siem', 'ire-sw', 'logs',       { label: 'Log export' }),
    ],
  },
};
