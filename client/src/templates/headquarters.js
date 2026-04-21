import { device, zone, edge, zoneSize } from './_shared.js';

// New mental model:
//   - Zones contain WORKLOADS only (VMs, hypervisors, databases, clients…).
//   - Network devices (router, switch, firewall, MPLS, 5G) live OUTSIDE
//     any zone, on the canvas background. They route traffic between
//     zones and to the outside world.
//   - Edges go network-device ↔ zone, or network-device ↔ network-device.

const Z = {
  campus: zoneSize(3, 2),
  dc:     zoneSize(3, 2),
  cloud:  zoneSize(2, 2),
};

// Outer layout
const GAP   = 60;
const NET_X = 0;                                 // column for network fabric
const NET_W = 240;                                // width reserved for network column
const Z_X   = NET_X + NET_W + GAP;                // zones start here

const Z_CAMPUS = { x: Z_X, y: 0 };
const Z_DC     = { x: Z_X, y: Z.campus.height + GAP };
const Z_CLOUD  = { x: Z_X + Z.campus.width + GAP, y: 0 };

// Column of network devices on the left. Each is a free-standing node.
const netCol = (x, y) => ({ type: 'device', position: { x, y } });
const netNode = (id, iconKey, x, y, data = {}) => ({
  id, type: 'device', position: { x, y },
  data: { iconKey, ...data },
});

const IN_X  = NET_X;
const OUT_X = NET_X + 140;
const NET_COL_X = NET_X + 70;

export default {
  id: 'headquarters',
  name: 'Headquarters (HQ)',
  description:
    'Corporate HQ: workloads live in zones (campus LAN, on-prem DC, cloud). The network fabric — firewall, core switch, MPLS, 5G backup — sits outside the zones and carries traffic between them.',
  graph: {
    nodes: [
      // --- Zones (workloads only) ---
      zone('z-campus', Z_CAMPUS.x, Z_CAMPUS.y, Z.campus.width, Z.campus.height,
        { color: '#3b82f6', label: 'HQ Campus LAN', sublabel: 'Workstations · Wi-Fi · VoIP · CCTV' }),
      zone('z-dc', Z_DC.x, Z_DC.y, Z.dc.width, Z.dc.height,
        { color: '#8b5cf6', label: 'On-prem Data Centre', sublabel: 'Hypervisor cluster + business VMs' }),
      zone('z-cloud', Z_CLOUD.x, Z_CLOUD.y, Z.cloud.width, Z.cloud.height,
        { color: '#06b6d4', label: 'Cloud / SaaS', sublabel: 'IaaS + productivity services' }),

      // --- Workloads inside zones ---
      device('hq-ap',      'ap',     'z-campus', 0, 0, { label: 'Wi-Fi (corporate)', capacity: '50 APs' }),
      device('hq-users',   'client', 'z-campus', 1, 0, { label: 'Workstations',      capacity: '800 seats' }),
      device('hq-voip',    'client', 'z-campus', 2, 0, { label: 'VoIP / Contact Centre', capacity: '200 agents' }),
      device('hq-print',   'server', 'z-campus', 0, 1, { label: 'Print Services' }),
      device('hq-cctv',    'client', 'z-campus', 1, 1, { label: 'CCTV / Physical Security' }),

      device('hq-hv',        'hypervisor', 'z-dc', 0, 0, { label: 'Hypervisor Cluster',   capacity: '12 hosts · HA' }),
      device('hq-erp',       'vm',         'z-dc', 1, 0, { label: 'ERP VM',                capacity: 'Crown-jewel', risk: 'high' }),
      device('hq-ecom',      'vm',         'z-dc', 2, 0, { label: 'e-Commerce VM',         capacity: 'Customer orders' }),
      device('hq-identity',  'vm',         'z-dc', 0, 1, { label: 'Identity VM (AD/SSO)',  capacity: 'SSO all sites', risk: 'high' }),
      device('hq-bi',        'database',   'z-dc', 1, 1, { label: 'Data Lake / BI' }),
      device('hq-backup',    'server',     'z-dc', 2, 1, { label: 'Backup Appliance',      capacity: 'Feeds IRE' }),

      device('hq-saas', 'cloud', 'z-cloud', 0, 0, { label: 'M365 / Collaboration', capacity: 'Email · Teams' }),
      device('hq-iaas', 'cloud', 'z-cloud', 1, 0, { label: 'IaaS (public cloud)',  capacity: 'DR / elastic' }),
      device('hq-mdm',  'cloud', 'z-cloud', 0, 1, { label: 'MDM / EDR' }),
      device('hq-ecom-cdn', 'cloud', 'z-cloud', 1, 1, { label: 'e-Commerce CDN / WAF' }),

      // --- Network fabric (outside any zone) ---
      netNode('hq-in',       'boundary-input',  IN_X,   0,   { label: 'From customers / branches', phase: 'Current' }),
      netNode('hq-out',      'boundary-output', OUT_X,  0,   { label: 'To customers / SaaS',       phase: 'Current' }),
      netNode('hq-fw',       'firewall',        NET_COL_X, 140, { label: 'Perimeter Firewall', risk: 'medium' }),
      netNode('hq-core',     'switch',          NET_COL_X, 280, { label: 'Core Switch' }),
      netNode('hq-mpls',     'router',          IN_X,   440, { label: 'MPLS Edge',  capacity: 'Primary', phase: 'Primary' }),
      netNode('hq-5g',       'ap',              OUT_X,  440, { label: '5G Gateway', capacity: 'Backup',  phase: 'Backup' }),
      netNode('hq-internet', 'cloud',           NET_COL_X, 580, { label: 'Internet',   capacity: 'Dual ISP' }),
    ],
    edges: [
      // External ingress / egress through the firewall
      edge('e1', 'hq-in',  'hq-fw', 'wan',     { label: 'Inbound' }),
      edge('e2', 'hq-fw',  'hq-out', 'wan',    { label: 'Outbound' }),

      // Firewall ↔ core switch ↔ zones
      edge('e3', 'hq-fw',   'hq-core', 'network'),
      edge('e4', 'hq-core', 'z-campus','network'),
      edge('e5', 'hq-core', 'z-dc',    'network'),

      // WAN transports
      edge('e6', 'hq-fw',   'hq-mpls',     'wan', { label: 'Primary · MPLS' }),
      edge('e7', 'hq-fw',   'hq-5g',       'wan', { label: 'Backup · 5G' }),
      edge('e8', 'hq-fw',   'hq-internet', 'network'),
      edge('e9', 'hq-internet', 'z-cloud', 'network', { label: 'SaaS / IaaS' }),

      // Replication to cloud
      edge('e10', 'z-dc', 'z-cloud', 'replication', { label: 'Backup replication' }),
    ],
  },
};
