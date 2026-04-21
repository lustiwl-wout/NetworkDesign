import { device, zone, edge, zoneSize } from './_shared.js';

// Layout strategy:
//   - A single "network fabric" column on the left at NET_X.
//   - Each network device occupies its own row (NET_ROW spacing).
//   - Zones sit to the right, starting at ZONE_X.
//   - Nothing overlaps: column width is 240, row height is 200,
//     both larger than the rendered node size (~180 × 160).

const NET_X    = 0;
const NET_ROW  = 200;
const ZONE_X   = 260;
const ZONE_GAP = 60;

const netNode = (id, iconKey, y, data = {}) => ({
  id, type: 'device', position: { x: NET_X, y },
  data: { iconKey, ...data },
});

const Z = {
  campus: zoneSize(3, 2),
  dc:     zoneSize(3, 2),
  cloud:  zoneSize(2, 2),
};

const Z_CAMPUS = { x: ZONE_X, y: 0 };
const Z_DC     = { x: ZONE_X, y: Z.campus.height + ZONE_GAP };
const Z_CLOUD  = { x: ZONE_X + Z.campus.width + ZONE_GAP, y: 0 };

export default {
  id: 'headquarters',
  name: 'Headquarters (HQ)',
  description:
    'Corporate HQ: workloads live in zones (campus LAN, on-prem DC, cloud). The network fabric — firewall, core switch, MPLS, 5G backup — sits outside the zones in a single column and carries traffic between them.',
  graph: {
    nodes: [
      // --- Zones (workloads only) ---
      zone('z-campus', Z_CAMPUS.x, Z_CAMPUS.y, Z.campus.width, Z.campus.height,
        { color: '#3b82f6', label: 'HQ Campus LAN', sublabel: 'Workstations · Wi-Fi · VoIP · CCTV' }),
      zone('z-dc', Z_DC.x, Z_DC.y, Z.dc.width, Z.dc.height,
        { color: '#8b5cf6', label: 'On-prem Data Centre', sublabel: 'Hypervisor + business VMs' }),
      zone('z-cloud', Z_CLOUD.x, Z_CLOUD.y, Z.cloud.width, Z.cloud.height,
        { color: '#06b6d4', label: 'Cloud / SaaS', sublabel: 'IaaS + productivity services' }),

      // --- Workloads inside zones ---
      device('hq-ap',      'ap',     'z-campus', 0, 0, { label: 'Wi-Fi (corporate)', capacity: '50 APs' }),
      device('hq-users',   'client', 'z-campus', 1, 0, { label: 'Workstations',      capacity: '800 seats' }),
      device('hq-voip',    'client', 'z-campus', 2, 0, { label: 'VoIP / Contact Centre', capacity: '200 agents' }),
      device('hq-print',   'server', 'z-campus', 0, 1, { label: 'Print Services' }),
      device('hq-cctv',    'client', 'z-campus', 1, 1, { label: 'CCTV / Physical Security' }),

      device('hq-hv',       'hypervisor', 'z-dc', 0, 0, { label: 'Hypervisor Cluster', capacity: '12 hosts · HA' }),
      device('hq-erp',      'vm',         'z-dc', 1, 0, { label: 'ERP VM',             capacity: 'Crown-jewel', risk: 'high' }),
      device('hq-ecom',     'vm',         'z-dc', 2, 0, { label: 'e-Commerce VM' }),
      device('hq-identity', 'vm',         'z-dc', 0, 1, { label: 'Identity VM (AD/SSO)', risk: 'high' }),
      device('hq-bi',       'database',   'z-dc', 1, 1, { label: 'Data Lake / BI' }),
      device('hq-backup',   'server',     'z-dc', 2, 1, { label: 'Backup Appliance', capacity: 'Feeds IRE' }),

      device('hq-saas',     'cloud', 'z-cloud', 0, 0, { label: 'M365 / Collaboration' }),
      device('hq-iaas',     'cloud', 'z-cloud', 1, 0, { label: 'IaaS (public cloud)' }),
      device('hq-mdm',      'cloud', 'z-cloud', 0, 1, { label: 'MDM / EDR' }),
      device('hq-ecom-cdn', 'cloud', 'z-cloud', 1, 1, { label: 'e-Commerce CDN / WAF' }),

      // --- Network fabric column ---
      netNode('hq-in',       'boundary-input',  0 * NET_ROW, { label: 'From customers / branches', phase: 'Current' }),
      netNode('hq-out',      'boundary-output', 1 * NET_ROW, { label: 'To customers / SaaS',       phase: 'Current' }),
      netNode('hq-fw',       'firewall',        2 * NET_ROW, { label: 'Perimeter Firewall', risk: 'medium' }),
      netNode('hq-core',     'switch',          3 * NET_ROW, { label: 'Core Switch' }),
      netNode('hq-mpls',     'router',          4 * NET_ROW, { label: 'MPLS Edge',  capacity: 'Primary', phase: 'Primary' }),
      netNode('hq-5g',       'ap',              5 * NET_ROW, { label: '5G Gateway', capacity: 'Backup',  phase: 'Backup' }),
      netNode('hq-internet', 'cloud',           6 * NET_ROW, { label: 'Internet',   capacity: 'Dual ISP' }),
    ],
    edges: [
      edge('e1', 'hq-in',       'hq-fw',       'wan',     { label: 'Inbound' }),
      edge('e2', 'hq-fw',       'hq-out',      'wan',     { label: 'Outbound' }),
      edge('e3', 'hq-fw',       'hq-core',     'network'),
      edge('e4', 'hq-core',     'z-campus',    'network'),
      edge('e5', 'hq-core',     'z-dc',        'network'),
      edge('e6', 'hq-fw',       'hq-mpls',     'wan',     { label: 'Primary · MPLS' }),
      edge('e7', 'hq-fw',       'hq-5g',       'wan',     { label: 'Backup · 5G' }),
      edge('e8', 'hq-fw',       'hq-internet', 'network'),
      edge('e9', 'hq-internet', 'z-cloud',     'network', { label: 'SaaS / IaaS' }),
      edge('e10','z-dc',        'z-cloud',     'replication', { label: 'Backup replication' }),
    ],
  },
};
