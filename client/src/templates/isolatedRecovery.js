import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  prod: zoneSize(2, 2),
  ire:  zoneSize(2, 2),
};

const GAP = 60;
const Z_PROD = { x: 0, y: 100 };
const MID_X  = Z.prod.width + GAP;
const Z_IRE  = { x: MID_X + 220 + GAP, y: 100 };

const netNode = (id, iconKey, x, y, data = {}) => ({
  id, type: 'device', position: { x, y },
  data: { iconKey, ...data },
});

export default {
  id: 'isolated-recovery-environment',
  name: 'Isolated Recovery Environment (IRE)',
  description:
    'Production workloads replicate one-way through an air-gapped diode into the IRE, which hosts immutable backups and clean-room recovery VMs. Aligns with NIST SP 800-209 / Sheltered Harbor.',
  graph: {
    nodes: [
      // Zones hold workloads only
      zone('zone-prod', Z_PROD.x, Z_PROD.y, Z.prod.width, Z.prod.height,
        { color: '#3b82f6', label: 'Production', sublabel: 'Live business services' }),
      zone('zone-ire', Z_IRE.x, Z_IRE.y, Z.ire.width, Z.ire.height,
        { color: '#22c55e', label: 'Isolated Recovery Environment', sublabel: 'Immutable · Clean room' }),

      // Production workloads
      device('prod-db',     'database', 'zone-prod', 0, 0, { label: 'Production DB',   capacity: '40 TB', risk: 'high',   phase: 'Current' }),
      device('prod-app',    'vm',       'zone-prod', 1, 0, { label: 'Application VMs', capacity: '120 VMs', risk: 'medium', phase: 'Current' }),
      device('prod-backup', 'server',   'zone-prod', 0, 1, { label: 'Backup Source',   capacity: 'Proxy / media', risk: 'medium', phase: 'Current' }),

      // IRE workloads
      device('ire-vault',    'database', 'zone-ire', 0, 0, { label: 'Immutable Vault',        capacity: '500 TB · Object Lock', risk: 'low',  phase: 'Proposed' }),
      device('ire-recovery', 'vm',       'zone-ire', 1, 0, { label: 'Clean-room Recovery VMs', capacity: '8 restore VMs',       risk: 'low',  phase: 'Proposed' }),
      device('ire-forensic', 'client',   'zone-ire', 0, 1, { label: 'Forensic Workstation',    capacity: 'Malware analysis',    risk: 'low',  phase: 'Proposed' }),

      // Network devices (outside the zones): firewalls, diode
      netNode('prod-fw',   'firewall', MID_X, 40,  { label: 'Prod Firewall',  risk: 'medium' }),
      netNode('air-in',    'boundary-input', MID_X, 180, { label: 'Replication Ingress', capacity: 'Scheduled only', phase: 'Current' }),
      netNode('air-relay', 'cloud',    MID_X, 320, { label: 'One-way Diode',   capacity: 'Scheduled' }),
      netNode('ire-fw',    'firewall', MID_X, 460, { label: 'Vault Firewall', capacity: 'Ingress-only', risk: 'low', phase: 'Proposed' }),

      // OOB management outside zones
      netNode('mgmt-jump', 'server', Z_IRE.x, Z_IRE.y + Z.ire.height + GAP,        { label: 'Jump Host (OOB)', capacity: 'MFA · PAM', phase: 'Proposed' }),
      netNode('mgmt-siem', 'server', Z_IRE.x + 220, Z_IRE.y + Z.ire.height + GAP,  { label: 'SIEM Forwarder', capacity: 'Read-only logs', phase: 'Proposed' }),
    ],
    edges: [
      // Production zone → firewall → diode → IRE firewall → IRE zone (one-way replication flow)
      edge('e1', 'zone-prod', 'prod-fw',   'network'),
      edge('e2', 'prod-fw',   'air-in',    'replication', { label: 'One-way replication' }),
      edge('e3', 'air-in',    'air-relay', 'replication'),
      edge('e4', 'air-relay', 'ire-fw',    'replication'),
      edge('e5', 'ire-fw',    'zone-ire',  'replication'),

      // OOB management plane into the IRE zone
      edge('m1', 'mgmt-jump', 'zone-ire', 'management', { label: 'Admin (via jump host)' }),
      edge('m2', 'mgmt-siem', 'zone-ire', 'logs',       { label: 'Log export' }),
    ],
  },
};
