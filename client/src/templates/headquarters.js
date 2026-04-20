import { device, zone, edge, zoneSize } from './_shared.js';

// Zone layouts: cols × rows slots
const Z = {
  campus: zoneSize(3, 2),
  dc:     zoneSize(3, 2),
  cloud:  zoneSize(2, 2),
  edge:   zoneSize(2, 2),
  mgmt:   zoneSize(2, 1),
};

// Zone positions on the outer canvas
const GAP = 40;
const Z_CAMPUS = { x: 0, y: 0 };
const Z_DC     = { x: 0, y: Z.campus.height + GAP };
const Z_CLOUD  = { x: Z.campus.width + GAP, y: 0 };
const Z_EDGE   = { x: Z.campus.width + GAP, y: Z.cloud.height + GAP };
const Z_MGMT   = { x: Z.campus.width + GAP, y: Z.cloud.height + Z.edge.height + GAP * 2 };

export default {
  id: 'headquarters',
  name: 'Headquarters (HQ)',
  description:
    'Corporate HQ for a mid-to-large B2B technical wholesaler: virtualised on-prem data centre with ERP / e-commerce / identity VMs, cloud SaaS, and a dual WAN (MPLS primary, 5G backup).',
  graph: {
    nodes: [
      zone('z-campus', Z_CAMPUS.x, Z_CAMPUS.y, Z.campus.width, Z.campus.height,
        { color: '#3b82f6', label: 'HQ Campus LAN', sublabel: 'Offices, meeting rooms, Wi-Fi' }),
      zone('z-dc',     Z_DC.x,     Z_DC.y,     Z.dc.width,     Z.dc.height,
        { color: '#8b5cf6', label: 'On-prem Data Centre', sublabel: 'Hypervisor cluster + business VMs' }),
      zone('z-cloud',  Z_CLOUD.x,  Z_CLOUD.y,  Z.cloud.width,  Z.cloud.height,
        { color: '#06b6d4', label: 'Cloud / SaaS', sublabel: 'IaaS + productivity services' }),
      zone('z-edge',   Z_EDGE.x,   Z_EDGE.y,   Z.edge.width,   Z.edge.height,
        { color: '#f59e0b', label: 'WAN Edge', sublabel: 'MPLS · 5G backup' }),
      zone('z-mgmt',   Z_MGMT.x,   Z_MGMT.y,   Z.mgmt.width,   Z.mgmt.height,
        { color: '#94a3b8', label: 'Management' }),

      // Campus LAN (3x2)
      device('hq-core-sw', 'switch', 'z-campus', 0, 0, { label: 'Core Switch',       capacity: 'L2/L3 stack', inputs: 4, outputs: 8 }),
      device('hq-ap',      'ap',     'z-campus', 1, 0, { label: 'Wi-Fi (corporate)', capacity: '50 APs', inputs: 1, outputs: 4 }),
      device('hq-users',   'client', 'z-campus', 2, 0, { label: 'Workstations',      capacity: '800 seats' }),
      device('hq-voip',    'client', 'z-campus', 0, 1, { label: 'VoIP / Contact Center', capacity: '200 agents' }),
      device('hq-print',   'server', 'z-campus', 1, 1, { label: 'Print Services' }),
      device('hq-cctv',    'client', 'z-campus', 2, 1, { label: 'CCTV / Physical Security' }),

      // Data Centre (3x2)
      device('hq-dc-sw',    'switch',     'z-dc', 0, 0, { label: 'DC Switch',              inputs: 4, outputs: 8 }),
      device('hq-hv',       'hypervisor', 'z-dc', 1, 0, { label: 'Hypervisor Cluster',      capacity: '12 hosts · HA' }),
      device('hq-backup',   'server',     'z-dc', 2, 0, { label: 'Backup Appliance',        capacity: 'Hardware · source to IRE' }),
      device('hq-erp',      'vm',         'z-dc', 0, 1, { label: 'ERP VM',                  capacity: 'Crown-jewel', risk: 'high' }),
      device('hq-ecom',     'vm',         'z-dc', 1, 1, { label: 'e-Commerce VM',           capacity: 'Customer orders' }),
      device('hq-identity', 'vm',         'z-dc', 2, 1, { label: 'Identity VM (AD / SSO)', capacity: 'SSO all sites', risk: 'high' }),

      // Cloud / SaaS (2x2)
      device('hq-saas',     'cloud', 'z-cloud', 0, 0, { label: 'M365 / Collaboration',  capacity: 'Email · Teams · OneDrive' }),
      device('hq-iaas',     'cloud', 'z-cloud', 1, 0, { label: 'IaaS (public cloud)',   capacity: 'DR / elastic workloads' }),
      device('hq-ecom-cdn', 'cloud', 'z-cloud', 0, 1, { label: 'e-Commerce CDN / WAF',  capacity: 'Customer web' }),
      device('hq-mdm',      'cloud', 'z-cloud', 1, 1, { label: 'MDM / EDR' }),

      // WAN Edge (2x2)
      device('hq-fw',       'firewall', 'z-edge', 0, 0, { label: 'Perimeter Firewall', risk: 'medium' }),
      device('hq-internet', 'cloud',    'z-edge', 1, 0, { label: 'Internet',            capacity: 'Dual ISP' }),
      device('hq-mpls',     'router',   'z-edge', 0, 1, { label: 'MPLS Edge',           capacity: 'Primary · Private hub', phase: 'Primary', inputs: 2, outputs: 6 }),
      device('hq-5g',       'ap',       'z-edge', 1, 1, { label: '5G WAN Gateway',      capacity: 'Backup transport',       phase: 'Backup' }),

      // Management (2x1)
      device('hq-jump',    'server', 'z-mgmt', 0, 0, { label: 'Jump Host (PAM)',  capacity: 'MFA · OOB' }),
      device('hq-monitor', 'server', 'z-mgmt', 1, 0, { label: 'Monitoring / SIEM' }),
    ],
    edges: [
      // Campus
      edge('e1', 'hq-users', 'hq-core-sw', 'network'),
      edge('e2', 'hq-ap',    'hq-core-sw', 'network'),
      edge('e3', 'hq-voip',  'hq-core-sw', 'network'),
      edge('e4', 'hq-print', 'hq-core-sw', 'network'),
      edge('e5', 'hq-cctv',  'hq-core-sw', 'network'),
      edge('e6', 'hq-core-sw','hq-fw',     'network'),

      // Data Centre: VMs on the hypervisor
      edge('e7', 'hq-hv',       'hq-dc-sw', 'network'),
      edge('e8', 'hq-erp',      'hq-hv',    'network', { label: 'hosted' }),
      edge('e9', 'hq-ecom',     'hq-hv',    'network', { label: 'hosted' }),
      edge('e10','hq-identity', 'hq-hv',    'network', { label: 'hosted' }),
      edge('e11','hq-backup',   'hq-dc-sw', 'network'),
      edge('e12','hq-dc-sw',    'hq-fw',    'network'),

      // Cloud
      edge('e13','hq-fw',       'hq-internet', 'network'),
      edge('e14','hq-internet', 'hq-saas',     'network', { label: 'SaaS' }),
      edge('e15','hq-internet', 'hq-iaas',     'network'),
      edge('e16','hq-internet', 'hq-ecom-cdn', 'network'),
      edge('e17','hq-internet', 'hq-mdm',      'network'),

      // WAN (primary + backup, no SD-WAN)
      edge('e18','hq-fw', 'hq-mpls', 'wan', { label: 'Primary · MPLS' }),
      edge('e19','hq-fw', 'hq-5g',   'wan', { label: 'Backup · 5G' }),

      // Replication
      edge('e20','hq-backup', 'hq-iaas', 'replication', { label: 'Backup replication' }),

      // Management
      edge('e21','hq-jump',    'hq-core-sw', 'management', { label: 'Admin' }),
      edge('e22','hq-jump',    'hq-dc-sw',   'management', { label: 'Admin' }),
      edge('e23','hq-monitor', 'hq-fw',      'logs',       { label: 'Telemetry' }),
      edge('e24','hq-monitor', 'hq-mpls',    'logs',       { label: 'Telemetry' }),
    ],
  },
};
