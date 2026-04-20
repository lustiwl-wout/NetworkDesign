import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  warehouse: zoneSize(3, 2),
  office:    zoneSize(3, 1),
  dcdc:      zoneSize(3, 3),
  mgmt:      zoneSize(3, 1),
};

const GAP = 40;
const Z_WH   = { x: 0, y: 0 };
const Z_OFF  = { x: 0, y: Z.warehouse.height + GAP };
const Z_DCDC = { x: Z.warehouse.width + GAP, y: 0 };
const Z_MGMT = { x: Z.warehouse.width + GAP, y: Z.dcdc.height + GAP };

export default {
  id: 'distribution-center',
  name: 'Distribution Center (DC)',
  description:
    'Regional distribution / fulfilment centre: warehouse ops (WMS + handhelds + conveyor PLC), local office, and a small on-prem hypervisor. Connectivity: MPLS (primary), 5G (backup).',
  graph: {
    nodes: [
      zone('z-warehouse', Z_WH.x,   Z_WH.y,   Z.warehouse.width, Z.warehouse.height,
        { color: '#06b6d4', label: 'Warehouse LAN',  sublabel: 'Operations floor' }),
      zone('z-office',    Z_OFF.x,  Z_OFF.y,  Z.office.width,    Z.office.height,
        { color: '#3b82f6', label: 'DC Office',       sublabel: 'Planners, supervisors, admin' }),
      zone('z-dcdc',      Z_DCDC.x, Z_DCDC.y, Z.dcdc.width,      Z.dcdc.height,
        { color: '#8b5cf6', label: 'DC Data Room',    sublabel: 'Local hypervisor + WAN edge' }),
      zone('z-mgmt',      Z_MGMT.x, Z_MGMT.y, Z.mgmt.width,      Z.mgmt.height,
        { color: '#94a3b8', label: 'Management' }),

      // Warehouse (3x2)
      device('dc-sw-wh',     'switch', 'z-warehouse', 0, 0, { label: 'Warehouse Switch',       inputs: 4, outputs: 8 }),
      device('dc-ap',        'ap',     'z-warehouse', 1, 0, { label: 'Wi-Fi (industrial)',     capacity: '20 APs · QoS', inputs: 1, outputs: 6 }),
      device('dc-handhelds', 'client', 'z-warehouse', 2, 0, { label: 'RF Scanners / Handhelds', capacity: '120 devices' }),
      device('dc-conveyor',  'server', 'z-warehouse', 0, 1, { label: 'Conveyor / Sortation PLC', capacity: 'OT · segmented VLAN', risk: 'high' }),
      device('dc-label',     'server', 'z-warehouse', 1, 1, { label: 'Label / Receipt Printers', capacity: '40 printers' }),
      device('dc-cctv',      'client', 'z-warehouse', 2, 1, { label: 'CCTV / Access Control' }),

      // Office (3x1)
      device('dc-sw-off',  'switch', 'z-office', 0, 0, { label: 'Office Switch',       inputs: 2, outputs: 8 }),
      device('dc-users',   'client', 'z-office', 1, 0, { label: 'Office Workstations', capacity: '60 seats' }),
      device('dc-voip',    'client', 'z-office', 2, 0, { label: 'VoIP Handsets' }),

      // DC Data Room (3x3) with explicit input/output boundaries to HQ & shops
      device('dc-in',       'boundary-input', 'z-dcdc', 0, 0, { label: 'From HQ / Customers', capacity: 'Inbound traffic', phase: 'Current' }),
      device('dc-fw',       'firewall',        'z-dcdc', 1, 0, { label: 'DC Firewall', risk: 'medium' }),
      device('dc-out',      'boundary-output', 'z-dcdc', 2, 0, { label: 'To Shops / Carriers', capacity: 'Outbound traffic', phase: 'Current' }),
      device('dc-sw-core',  'switch',          'z-dcdc', 0, 1, { label: 'DC Core Switch', inputs: 4, outputs: 8 }),
      device('dc-hv',       'hypervisor',      'z-dcdc', 1, 1, { label: 'Hypervisor (2-node)', capacity: 'HA pair' }),
      device('dc-backup',   'server',          'z-dcdc', 2, 1, { label: 'Local Backup Appliance', capacity: 'Hardware · feeds HQ → IRE' }),
      device('dc-mpls',     'router',          'z-dcdc', 0, 2, { label: 'MPLS Edge',  capacity: 'Primary · to HQ', phase: 'Primary',  inputs: 2, outputs: 3 }),
      device('dc-5g',       'ap',              'z-dcdc', 1, 2, { label: '5G WAN Gateway', capacity: 'Backup transport', phase: 'Backup' }),

      // Management (2x1)
      device('dc-jump',     'server', 'z-mgmt', 0, 0, { label: 'Jump Host (PAM)' }),
      device('dc-monitor',  'server', 'z-mgmt', 1, 0, { label: 'Monitoring Agent' }),
    ],
    edges: [
      // Warehouse network
      edge('w1', 'dc-ap',        'dc-sw-wh', 'network'),
      edge('w2', 'dc-handhelds', 'dc-ap',    'network', { label: 'Wi-Fi' }),
      edge('w3', 'dc-conveyor',  'dc-sw-wh', 'network'),
      edge('w4', 'dc-label',     'dc-sw-wh', 'network'),
      edge('w5', 'dc-cctv',      'dc-sw-wh', 'network'),
      edge('w6', 'dc-sw-wh',     'dc-fw',    'network'),

      // Office
      edge('o1', 'dc-users', 'dc-sw-off', 'network'),
      edge('o2', 'dc-voip',  'dc-sw-off', 'network'),
      edge('o3', 'dc-sw-off','dc-fw',     'network'),

      // Inbound / outbound through the firewall
      edge('d-in',  'dc-in',  'dc-fw',  'wan', { label: 'Inbound' }),
      edge('d-out', 'dc-fw',  'dc-out', 'wan', { label: 'Outbound' }),

      // DC core: VMs run on the hypervisor
      edge('d1', 'dc-fw',      'dc-sw-core', 'network'),
      edge('d2', 'dc-hv',      'dc-sw-core', 'network', { label: 'WMS · TMS VMs' }),
      edge('d3', 'dc-backup',  'dc-sw-core', 'network'),

      // WAN (primary + backup, no SD-WAN)
      edge('d4', 'dc-sw-core', 'dc-mpls', 'wan', { label: 'Primary · MPLS to HQ' }),
      edge('d5', 'dc-sw-core', 'dc-5g',   'wan', { label: 'Backup · 5G' }),

      // Replication
      edge('d6', 'dc-backup', 'dc-mpls', 'replication', { label: 'Backup → HQ / IRE' }),

      // Management
      edge('m1', 'dc-jump',    'dc-sw-core', 'management', { label: 'Admin' }),
      edge('m2', 'dc-jump',    'dc-sw-wh',   'management', { label: 'Admin' }),
      edge('m3', 'dc-monitor', 'dc-mpls',    'logs',       { label: 'Telemetry' }),
    ],
  },
};
