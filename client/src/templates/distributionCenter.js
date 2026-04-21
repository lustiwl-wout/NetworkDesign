import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  warehouse: zoneSize(3, 2),
  office:    zoneSize(3, 1),
  dcroom:    zoneSize(2, 2),
};

const GAP   = 60;
const NET_X = 0;
const NET_W = 240;
const Z_X   = NET_X + NET_W + GAP;

const Z_WH   = { x: Z_X, y: 0 };
const Z_OFF  = { x: Z_X, y: Z.warehouse.height + GAP };
const Z_DCDC = { x: Z_X + Z.warehouse.width + GAP, y: 0 };

const netNode = (id, iconKey, x, y, data = {}) => ({
  id, type: 'device', position: { x, y },
  data: { iconKey, ...data },
});

const IN_X  = NET_X;
const OUT_X = NET_X + 140;
const NET_COL_X = NET_X + 70;

export default {
  id: 'distribution-center',
  name: 'Distribution Center (DC)',
  description:
    'Regional DC: workloads live in zones (warehouse floor, office, DC data room). The network fabric — firewall, core switch, MPLS, 5G — sits outside and routes traffic between zones and back to HQ.',
  graph: {
    nodes: [
      // --- Zones ---
      zone('z-warehouse', Z_WH.x, Z_WH.y, Z.warehouse.width, Z.warehouse.height,
        { color: '#06b6d4', label: 'Warehouse LAN', sublabel: 'Handhelds · PLCs · printers · CCTV' }),
      zone('z-office', Z_OFF.x, Z_OFF.y, Z.office.width, Z.office.height,
        { color: '#3b82f6', label: 'DC Office', sublabel: 'Planners · supervisors · VoIP' }),
      zone('z-dcdc', Z_DCDC.x, Z_DCDC.y, Z.dcroom.width, Z.dcroom.height,
        { color: '#8b5cf6', label: 'DC Data Room', sublabel: 'Hypervisor + WMS/TMS VMs' }),

      // --- Workloads ---
      device('dc-ap',        'ap',     'z-warehouse', 0, 0, { label: 'Wi-Fi (industrial)',     capacity: '20 APs · QoS' }),
      device('dc-handhelds', 'client', 'z-warehouse', 1, 0, { label: 'RF Scanners / Handhelds', capacity: '120 devices' }),
      device('dc-conveyor',  'server', 'z-warehouse', 2, 0, { label: 'Conveyor / Sortation PLC', capacity: 'OT VLAN', risk: 'high' }),
      device('dc-label',     'server', 'z-warehouse', 0, 1, { label: 'Label / Receipt Printers' }),
      device('dc-cctv',      'client', 'z-warehouse', 1, 1, { label: 'CCTV / Access Control' }),

      device('dc-users', 'client', 'z-office', 0, 0, { label: 'Office Workstations', capacity: '60 seats' }),
      device('dc-voip',  'client', 'z-office', 1, 0, { label: 'VoIP Handsets' }),
      device('dc-print', 'server', 'z-office', 2, 0, { label: 'Office Print' }),

      device('dc-hv',     'hypervisor', 'z-dcdc', 0, 0, { label: 'Hypervisor (2-node)', capacity: 'HA pair' }),
      device('dc-wms',    'vm',         'z-dcdc', 1, 0, { label: 'WMS VM', risk: 'high' }),
      device('dc-tms',    'vm',         'z-dcdc', 0, 1, { label: 'TMS VM' }),
      device('dc-backup', 'server',     'z-dcdc', 1, 1, { label: 'Local Backup Appliance' }),

      // --- Network fabric (outside any zone) ---
      netNode('dc-in',    'boundary-input',  IN_X,   0,   { label: 'From HQ / Customers', phase: 'Current' }),
      netNode('dc-out',   'boundary-output', OUT_X,  0,   { label: 'To Shops / Carriers', phase: 'Current' }),
      netNode('dc-fw',    'firewall',        NET_COL_X, 140, { label: 'DC Firewall', risk: 'medium' }),
      netNode('dc-core',  'switch',          NET_COL_X, 280, { label: 'DC Core Switch' }),
      netNode('dc-mpls',  'router',          IN_X,   420, { label: 'MPLS Edge',  capacity: 'Primary', phase: 'Primary' }),
      netNode('dc-5g',    'ap',              OUT_X,  420, { label: '5G Gateway', capacity: 'Backup',  phase: 'Backup' }),
    ],
    edges: [
      // External ingress / egress
      edge('d-in',  'dc-in',  'dc-fw', 'wan', { label: 'Inbound' }),
      edge('d-out', 'dc-fw',  'dc-out', 'wan',{ label: 'Outbound' }),

      // Firewall ↔ core switch ↔ zones
      edge('d1', 'dc-fw',   'dc-core', 'network'),
      edge('d2', 'dc-core', 'z-warehouse', 'network'),
      edge('d3', 'dc-core', 'z-office',    'network'),
      edge('d4', 'dc-core', 'z-dcdc',      'network'),

      // WAN transports back to HQ
      edge('d5', 'dc-fw', 'dc-mpls', 'wan', { label: 'Primary · MPLS to HQ' }),
      edge('d6', 'dc-fw', 'dc-5g',   'wan', { label: 'Backup · 5G' }),

      // Replication
      edge('d7', 'z-dcdc', 'dc-mpls', 'replication', { label: 'Backup → HQ / IRE' }),
    ],
  },
};
