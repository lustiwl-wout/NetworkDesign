import { device, zone, edge } from './_shared.js';

export default {
  id: 'headquarters',
  name: 'Headquarters (HQ)',
  description:
    'Corporate HQ for a mid-to-large B2B technical wholesaler: ERP and e-commerce back-end, identity, BI / data lake, collaboration. Connectivity: MPLS hub (primary) · SD-WAN overlay (optional) · 5G (backup).',
  graph: {
    nodes: [
      zone('z-campus',   0,    0,   560, 420, { color: '#3b82f6', label: 'HQ Campus LAN',       sublabel: 'Offices, meeting rooms, Wi-Fi' }),
      zone('z-dc',       0,    440, 560, 440, { color: '#8b5cf6', label: 'On-prem Data Centre', sublabel: 'Hypervisor cluster + business VMs' }),
      zone('z-cloud',    600,  0,   460, 420, { color: '#06b6d4', label: 'Cloud / SaaS',        sublabel: 'IaaS + productivity services' }),
      zone('z-edge',     600,  440, 460, 300, { color: '#f59e0b', label: 'WAN Edge',            sublabel: 'MPLS · SD-WAN · 5G' }),
      zone('z-mgmt',     600,  760, 460, 140, { color: '#94a3b8', label: 'Management' }),

      // Campus LAN
      device('hq-core-sw',   'switch', 60,  60,  { label: 'Core Switch',           capacity: 'L2/L3 stack',    inputs: 4, outputs: 8 }),
      device('hq-ap',        'ap',     240, 60,  { label: 'Wi-Fi (corporate)',     capacity: '50 APs',         inputs: 1, outputs: 4 }),
      device('hq-users',     'client', 400, 60,  { label: 'Workstations',          capacity: '800 seats' }),
      device('hq-voip',      'client', 60,  200, { label: 'VoIP / Contact Center', capacity: '200 agents' }),
      device('hq-print',     'server', 240, 200, { label: 'Print Services' }),
      device('hq-kiosk',     'client', 400, 200, { label: 'Reception Kiosk' }),
      device('hq-cctv',      'client', 240, 320, { label: 'CCTV / Physical Security' }),

      // Data Center — virtualised on a hypervisor cluster
      device('hq-dc-sw',     'switch',     60,  480, { label: 'DC Switch',                   inputs: 4, outputs: 8 }),
      device('hq-hv',        'hypervisor', 240, 480, { label: 'Hypervisor Cluster',          capacity: '12 hosts · HA', inputs: 2, outputs: 6 }),
      device('hq-erp',       'vm',         400, 480, { label: 'ERP (Order / Stock / Finance)', capacity: 'Crown-jewel VM', risk: 'high' }),
      device('hq-ecom',      'vm',         60,  620, { label: 'e-Commerce Backend VM',        capacity: 'Customer orders' }),
      device('hq-identity',  'vm',         240, 620, { label: 'Identity VM (AD / SSO)',       capacity: 'SSO for all sites', risk: 'high' }),
      device('hq-bi',        'database',   400, 620, { label: 'Data Lake / BI',               capacity: 'Analytics' }),
      device('hq-backup',    'server',     60,  760, { label: 'Backup Appliance',             capacity: 'Hardware · source to IRE' }),

      // Cloud / SaaS
      device('hq-saas',      'cloud', 660, 60,  { label: 'M365 / Collaboration',  capacity: 'Email · Teams · OneDrive' }),
      device('hq-iaas',      'cloud', 840, 60,  { label: 'IaaS (public cloud)',   capacity: 'DR / elastic workloads' }),
      device('hq-ecom-cdn',  'cloud', 660, 220, { label: 'e-Commerce CDN / WAF',  capacity: 'Customer web' }),
      device('hq-mdm',       'cloud', 840, 220, { label: 'MDM / EDR' }),

      // WAN edge
      device('hq-fw',        'firewall', 660, 480, { label: 'Perimeter Firewall', risk: 'medium' }),
      device('hq-mpls',      'router',   660, 580, { label: 'MPLS Edge',          capacity: 'Primary · Private hub',  phase: 'Primary',  inputs: 2, outputs: 6 }),
      device('hq-sdwan',     'router',   840, 580, { label: 'SD-WAN Edge',        capacity: 'Overlay · Break-out',     phase: 'Optional', inputs: 2, outputs: 6 }),
      device('hq-5g',        'ap',       660, 700, { label: '5G WAN Gateway',     capacity: 'Backup transport',        phase: 'Backup',   inputs: 1, outputs: 1 }),
      device('hq-internet',  'cloud',    840, 480, { label: 'Internet',           capacity: 'Dual ISP' }),

      // Management
      device('hq-jump',      'server', 660, 800, { label: 'Jump Host (PAM)',  capacity: 'MFA · OOB' }),
      device('hq-monitor',   'server', 840, 800, { label: 'Monitoring / SIEM' }),
    ],
    edges: [
      // Campus LAN
      edge('e1',  'hq-users',  'hq-core-sw', 'network'),
      edge('e2',  'hq-ap',     'hq-core-sw', 'network'),
      edge('e3',  'hq-voip',   'hq-core-sw', 'network'),
      edge('e4',  'hq-print',  'hq-core-sw', 'network'),
      edge('e5',  'hq-kiosk',  'hq-core-sw', 'network'),
      edge('e6',  'hq-cctv',   'hq-core-sw', 'network'),
      edge('e7',  'hq-core-sw','hq-fw',      'network'),

      // Data Center: VMs run on the hypervisor cluster; cluster is the only
      // thing on the network fabric from the DC perspective.
      edge('e8',  'hq-hv',       'hq-dc-sw', 'network'),
      edge('e9',  'hq-erp',      'hq-hv',    'network', { label: 'hosted' }),
      edge('e10', 'hq-ecom',     'hq-hv',    'network', { label: 'hosted' }),
      edge('e11', 'hq-identity', 'hq-hv',    'network', { label: 'hosted' }),
      edge('e12', 'hq-bi',       'hq-dc-sw', 'network'),
      edge('e13', 'hq-backup',   'hq-dc-sw', 'network'),
      edge('e13b','hq-dc-sw',    'hq-fw',    'network'),

      // Cloud
      edge('e14', 'hq-fw',       'hq-internet', 'network'),
      edge('e15', 'hq-internet', 'hq-saas',     'network', { label: 'SaaS' }),
      edge('e16', 'hq-internet', 'hq-iaas',     'network'),
      edge('e17', 'hq-internet', 'hq-ecom-cdn', 'network'),
      edge('e18', 'hq-internet', 'hq-mdm',      'network'),

      // WAN (primary + optional + backup)
      edge('e19', 'hq-fw',    'hq-mpls',     'wan',     { label: 'Primary · MPLS' }),
      edge('e20', 'hq-fw',    'hq-sdwan',    'network', { label: 'Optional · SD-WAN' }),
      edge('e21', 'hq-fw',    'hq-5g',       'wan',     { label: 'Backup · 5G' }),
      edge('e22', 'hq-sdwan', 'hq-internet', 'wan',     { label: 'Overlay transport' }),

      // Replication
      edge('e23', 'hq-backup', 'hq-iaas', 'replication', { label: 'Backup replication' }),

      // Management plane
      edge('e24', 'hq-jump',    'hq-core-sw', 'management', { label: 'Admin' }),
      edge('e25', 'hq-jump',    'hq-dc-sw',   'management', { label: 'Admin' }),
      edge('e26', 'hq-monitor', 'hq-fw',      'logs',       { label: 'Telemetry' }),
      edge('e27', 'hq-monitor', 'hq-mpls',    'logs',       { label: 'Telemetry' }),
      edge('e28', 'hq-monitor', 'hq-sdwan',   'logs',       { label: 'Telemetry' }),
    ],
  },
};
