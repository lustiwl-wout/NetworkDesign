const prod = (id, type, x, y, data = {}) => ({
  id,
  type,
  position: { x, y },
  data: { phase: 'Current', ...data },
});

const ire = (id, type, x, y, data = {}) => ({
  id,
  type,
  position: { x, y },
  data: { phase: 'Proposed', ...data },
});

export default {
  id: 'isolated-recovery-environment',
  name: 'Isolated Recovery Environment (IRE)',
  description:
    'Cyber-resilient recovery architecture: production replicates one-way into an air-gapped vault containing immutable backups, a clean-room recovery environment, and forensic tooling. Aligns with NIST SP 800-209 and Sheltered Harbor guidance.',
  graph: {
    nodes: [
      {
        id: 'zone-prod',
        type: 'zone',
        position: { x: 0, y: 0 },
        style: { width: 520, height: 420 },
        data: { preset: 'production', label: 'Production', sublabel: 'Live business services' },
      },
      {
        id: 'zone-airgap',
        type: 'zone',
        position: { x: 560, y: 60 },
        style: { width: 220, height: 320 },
        data: {
          preset: 'airgap',
          label: 'Air Gap',
          sublabel: 'One-way replication, scheduled',
        },
      },
      {
        id: 'zone-ire',
        type: 'zone',
        position: { x: 820, y: 0 },
        style: { width: 620, height: 520 },
        data: {
          preset: 'ire',
          label: 'Isolated Recovery Environment',
          sublabel: 'Immutable · Air-gapped · Clean room',
        },
      },
      {
        id: 'zone-mgmt',
        type: 'zone',
        position: { x: 820, y: 540 },
        style: { width: 620, height: 140 },
        data: { preset: 'management', label: 'Out-of-Band Management' },
      },

      prod('prod-db', 'database', 60, 70, {
        label: 'Production DB',
        capacity: '40 TB',
        costAnnual: 260000,
        risk: 'high',
      }),
      prod('prod-app', 'server', 220, 70, {
        label: 'Application Tier',
        capacity: '120 VMs',
        costAnnual: 180000,
        risk: 'medium',
      }),
      prod('prod-sw', 'switch', 140, 200, {
        label: 'Core Switch',
        costAnnual: 18000,
        risk: 'medium',
      }),
      prod('prod-backup', 'server', 340, 200, {
        label: 'Backup Source',
        capacity: 'Proxy / media server',
        costAnnual: 45000,
        risk: 'medium',
      }),
      prod('prod-fw', 'firewall', 220, 320, {
        label: 'Perimeter Firewall',
        costAnnual: 35000,
        risk: 'medium',
      }),

      ire('ire-fw', 'firewall', 880, 70, {
        label: 'Vault Firewall',
        capacity: 'Ingress-only, allow-list',
        costAnnual: 30000,
        risk: 'low',
      }),
      ire('ire-sw', 'switch', 1050, 200, {
        label: 'Vault Switch',
        capacity: 'Isolated VLAN',
        costAnnual: 12000,
        risk: 'low',
      }),
      ire('ire-vault', 'database', 880, 320, {
        label: 'Immutable Backup Vault',
        capacity: '500 TB · Object Lock',
        costAnnual: 180000,
        risk: 'low',
      }),
      ire('ire-recovery', 'server', 1060, 320, {
        label: 'Clean-room Recovery',
        capacity: '8 restore VMs',
        costAnnual: 60000,
        risk: 'low',
      }),
      ire('ire-forensic', 'client', 1240, 320, {
        label: 'Forensic Workstation',
        capacity: 'Malware analysis',
        costAnnual: 15000,
        risk: 'low',
      }),

      ire('mgmt-jump', 'server', 900, 580, {
        label: 'Jump Host (OOB)',
        capacity: 'MFA · PAM',
        costAnnual: 20000,
        risk: 'low',
      }),
      ire('mgmt-siem', 'server', 1120, 580, {
        label: 'SIEM Forwarder',
        capacity: 'Read-only logs',
        costAnnual: 10000,
        risk: 'low',
      }),
    ],
    edges: [
      { id: 'e1', source: 'prod-db', target: 'prod-sw', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e2', source: 'prod-app', target: 'prod-sw', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e3', source: 'prod-sw', target: 'prod-backup', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e4', source: 'prod-sw', target: 'prod-fw', sourceHandle: 'out-0', targetHandle: 'in-0' },

      {
        id: 'e-airgap',
        source: 'prod-backup',
        target: 'ire-fw',
        sourceHandle: 'out-0',
        targetHandle: 'in-0',
        label: 'One-way replication',
        animated: true,
        style: { strokeDasharray: '6 4', stroke: '#22c55e', strokeWidth: 2 },
        labelStyle: { fill: '#22c55e', fontWeight: 600 },
      },

      { id: 'e5', source: 'ire-fw', target: 'ire-sw', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e6', source: 'ire-sw', target: 'ire-vault', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e7', source: 'ire-sw', target: 'ire-recovery', sourceHandle: 'out-0', targetHandle: 'in-0' },
      { id: 'e8', source: 'ire-sw', target: 'ire-forensic', sourceHandle: 'out-0', targetHandle: 'in-0' },

      {
        id: 'e9',
        source: 'mgmt-jump',
        target: 'ire-sw',
        sourceHandle: 'out-0',
        targetHandle: 'in-0',
        label: 'Admin',
        style: { stroke: '#94a3b8' },
      },
      {
        id: 'e10',
        source: 'mgmt-siem',
        target: 'ire-sw',
        sourceHandle: 'out-0',
        targetHandle: 'in-0',
        label: 'Log export',
        style: { stroke: '#94a3b8', strokeDasharray: '4 4' },
      },
    ],
  },
};
