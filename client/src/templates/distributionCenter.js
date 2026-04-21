import { device, zone, edge, zoneSize } from './_shared.js';

const NET_X    = 0;
const NET_ROW  = 200;
const ZONE_X   = 340;
const ZONE_GAP = 60;

const netNode = (id, iconKey, y, data = {}) => ({
  id, type: 'device', position: { x: NET_X, y },
  data: { iconKey, ...data },
});

const Z = {
  warehouse: zoneSize(3, 2),
  office:    zoneSize(3, 1),
  dcroom:    zoneSize(2, 2),
};

const Z_WH   = { x: ZONE_X, y: 0 };
const Z_OFF  = { x: ZONE_X, y: Z.warehouse.height + ZONE_GAP };
const Z_DCDC = { x: ZONE_X + Z.warehouse.width + ZONE_GAP, y: 0 };

export default {
  id: 'distribution-center',
  name: 'Distribution Center (DC)',
  description:
    'Regional DC: workloads live in zones (warehouse floor, office, DC data room). The network fabric — firewall, core switch, MPLS, 5G — sits outside the zones and routes traffic between zones and back to HQ.',
  graph: {
    nodes: [
      zone('z-warehouse', Z_WH.x, Z_WH.y, Z.warehouse.width, Z.warehouse.height,
        { color: '#06b6d4', label: 'Warehouse LAN', sublabel: 'Handhelds · PLCs · printers · CCTV' }),
      zone('z-office', Z_OFF.x, Z_OFF.y, Z.office.width, Z.office.height,
        { color: '#3b82f6', label: 'DC Office', sublabel: 'Planners · supervisors · VoIP' }),
      zone('z-dcdc', Z_DCDC.x, Z_DCDC.y, Z.dcroom.width, Z.dcroom.height,
        { color: '#8b5cf6', label: 'DC Data Room', sublabel: 'Hypervisor + WMS/TMS VMs' }),

      device('dc-ap',        'ap',     'z-warehouse', 0, 0, { label: 'Wi-Fi (industrial)',  capacity: '20 APs · QoS' }),
      device('dc-handhelds', 'client', 'z-warehouse', 1, 0, { label: 'RF Scanners',         capacity: '120 devices' }),
      device('dc-conveyor',  'server', 'z-warehouse', 2, 0, { label: 'Conveyor PLC', capacity: 'OT VLAN', risk: 'high' }),
      device('dc-label',     'server', 'z-warehouse', 0, 1, { label: 'Label Printers' }),
      device('dc-cctv',      'client', 'z-warehouse', 1, 1, { label: 'CCTV / Access Control' }),

      device('dc-users', 'client', 'z-office', 0, 0, { label: 'Workstations', capacity: '60 seats' }),
      device('dc-voip',  'client', 'z-office', 1, 0, { label: 'VoIP Handsets' }),
      device('dc-print', 'server', 'z-office', 2, 0, { label: 'Office Print' }),

      device('dc-hv',     'hypervisor', 'z-dcdc', 0, 0, { label: 'Hypervisor (2-node)', capacity: 'HA pair' }),
      device('dc-wms',    'vm',         'z-dcdc', 1, 0, { label: 'WMS VM', risk: 'high' }),
      device('dc-tms',    'vm',         'z-dcdc', 0, 1, { label: 'TMS VM' }),
      device('dc-backup', 'server',     'z-dcdc', 1, 1, { label: 'Local Backup Appliance' }),

      // Network fabric column
      netNode('dc-in',   'boundary-input',  0 * NET_ROW, { label: 'From HQ / Customers', phase: 'Current' }),
      netNode('dc-out',  'boundary-output', 1 * NET_ROW, { label: 'To Shops / Carriers', phase: 'Current' }),
      netNode('dc-fw',   'firewall',        2 * NET_ROW, { label: 'DC Firewall', risk: 'medium' }),
      netNode('dc-core', 'switch',          3 * NET_ROW, { label: 'DC Core Switch' }),
      netNode('dc-mpls', 'router',          4 * NET_ROW, { label: 'MPLS Edge',  capacity: 'Primary', phase: 'Primary' }),
      netNode('dc-5g',   'ap',              5 * NET_ROW, { label: '5G Gateway', capacity: 'Backup',  phase: 'Backup' }),
    ],
    edges: [
      edge('d-in',  'dc-in',  'dc-fw',  'wan', { label: 'Inbound' }),
      edge('d-out', 'dc-fw',  'dc-out', 'wan', { label: 'Outbound' }),
      edge('d1', 'dc-fw',   'dc-core',     'network'),
      edge('d2', 'dc-core', 'z-warehouse', 'network'),
      edge('d3', 'dc-core', 'z-office',    'network'),
      edge('d4', 'dc-core', 'z-dcdc',      'network'),
      edge('d5', 'dc-fw',   'dc-mpls',     'wan', { label: 'Primary · MPLS to HQ' }),
      edge('d6', 'dc-fw',   'dc-5g',       'wan', { label: 'Backup · 5G' }),
      edge('d7', 'z-dcdc',  'dc-mpls',     'replication', { label: 'Backup → HQ / IRE' }),
    ],
  },
};
