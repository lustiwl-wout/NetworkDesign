import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  prod:   zoneSize(2, 2),
  airgap: zoneSize(1, 2),
  ire:    zoneSize(3, 2),
  mgmt:   zoneSize(2, 1),
};

const GAP = 40;
const Z_PROD   = { x: 0, y: 0 };
const Z_AIR    = { x: Z.prod.width + GAP, y: 0 };
const Z_IRE    = { x: Z.prod.width + Z.airgap.width + GAP * 2, y: 0 };
const Z_MGMT   = { x: Z.prod.width + Z.airgap.width + GAP * 2, y: Z.ire.height + GAP };

export default {
  id: 'isolated-recovery-environment',
  name: 'Isolated Recovery Environment (IRE)',
  description:
    'Cyber-resilient recovery: production replicates one-way into an air-gapped vault containing immutable backups, a clean-room recovery environment, and forensic tooling. Aligns with NIST SP 800-209 and Sheltered Harbor guidance.',
  graph: {
    nodes: [
      zone('zone-prod',   Z_PROD.x, Z_PROD.y, Z.prod.width,   Z.prod.height,
        { color: '#3b82f6', label: 'Production', sublabel: 'Live business services' }),
      zone('zone-airgap', Z_AIR.x,  Z_AIR.y,  Z.airgap.width, Z.airgap.height,
        { color: '#64748b', label: 'Air Gap',    sublabel: 'One-way, scheduled' }),
      zone('zone-ire',    Z_IRE.x,  Z_IRE.y,  Z.ire.width,    Z.ire.height,
        { color: '#22c55e', label: 'Isolated Recovery Environment', sublabel: 'Immutable · Air-gapped · Clean room' }),
      zone('zone-mgmt',   Z_MGMT.x, Z_MGMT.y, Z.mgmt.width,   Z.mgmt.height,
        { color: '#94a3b8', label: 'Out-of-Band Management' }),

      // Production (2x2)
      device('prod-db',     'database', 'zone-prod', 0, 0, { label: 'Production DB',    capacity: '40 TB',  risk: 'high',   phase: 'Current' }),
      device('prod-app',    'vm',       'zone-prod', 1, 0, { label: 'Application VMs',  capacity: '120 VMs', risk: 'medium', phase: 'Current' }),
      device('prod-sw',     'switch',   'zone-prod', 0, 1, { label: 'Core Switch',                           risk: 'medium', phase: 'Current' }),
      device('prod-backup', 'server',   'zone-prod', 1, 1, { label: 'Backup Source',    capacity: 'Proxy / media', risk: 'medium', phase: 'Current' }),

      // Air-gap (1x2): a single repeater to anchor the replication edge
      device('air-relay',   'cloud',    'zone-airgap', 0, 0, { label: 'One-way Diode', capacity: 'Scheduled', phase: 'Current' }),

      // IRE (3x2)
      device('ire-fw',       'firewall', 'zone-ire', 0, 0, { label: 'Vault Firewall',        capacity: 'Ingress-only', risk: 'low', phase: 'Proposed' }),
      device('ire-sw',       'switch',   'zone-ire', 1, 0, { label: 'Vault Switch',          capacity: 'Isolated VLAN', risk: 'low', phase: 'Proposed' }),
      device('ire-forensic', 'client',   'zone-ire', 2, 0, { label: 'Forensic Workstation',  capacity: 'Malware analysis', risk: 'low', phase: 'Proposed' }),
      device('ire-vault',    'database', 'zone-ire', 0, 1, { label: 'Immutable Backup Vault', capacity: '500 TB · Object Lock', risk: 'low', phase: 'Proposed' }),
      device('ire-recovery', 'vm',       'zone-ire', 1, 1, { label: 'Clean-room Recovery VMs', capacity: '8 restore VMs', risk: 'low', phase: 'Proposed' }),

      // Management (2x1)
      device('mgmt-jump', 'server', 'zone-mgmt', 0, 0, { label: 'Jump Host (OOB)',  capacity: 'MFA · PAM', risk: 'low', phase: 'Proposed' }),
      device('mgmt-siem', 'server', 'zone-mgmt', 1, 0, { label: 'SIEM Forwarder',    capacity: 'Read-only logs', risk: 'low', phase: 'Proposed' }),
    ],
    edges: [
      edge('e1', 'prod-db',  'prod-sw', 'network'),
      edge('e2', 'prod-app', 'prod-sw', 'network'),
      edge('e3', 'prod-sw',  'prod-backup', 'network'),

      edge('e-airgap', 'prod-backup', 'air-relay', 'replication', { label: 'One-way replication' }),
      edge('e-ire-in', 'air-relay',   'ire-fw',    'replication'),

      edge('e4', 'ire-fw', 'ire-sw',        'network'),
      edge('e5', 'ire-sw', 'ire-vault',     'network'),
      edge('e6', 'ire-sw', 'ire-recovery',  'network'),
      edge('e7', 'ire-sw', 'ire-forensic',  'network'),

      edge('e8',  'mgmt-jump', 'ire-sw', 'management', { label: 'Admin' }),
      edge('e9',  'mgmt-siem', 'ire-sw', 'logs',       { label: 'Log export' }),
    ],
  },
};
