import { device, zone, edge } from './_shared.js';

export default {
  id: 'distribution-center',
  name: 'Distribution Center (DC)',
  description:
    'Regional distribution / fulfilment centre: warehouse ops (WMS, handhelds, conveyor control), local office, and WAN edge. Connectivity: MPLS (primary) · SD-WAN (optional) · 5G (backup). Supports 24/7 picking and outbound shipping.',
  graph: {
    nodes: [
      zone('z-warehouse', 0,    0,   640, 420, { color: '#06b6d4', label: 'Warehouse LAN',  sublabel: 'Operations floor' }),
      zone('z-office',    0,    440, 640, 260, { color: '#3b82f6', label: 'DC Office',       sublabel: 'Planners, supervisors, admin' }),
      zone('z-dcdc',      680,  0,   440, 540, { color: '#8b5cf6', label: 'DC Data Room',    sublabel: 'Local servers + WAN edge' }),
      zone('z-mgmt',      680,  560, 440, 260, { color: '#94a3b8', label: 'Management' }),

      // Warehouse
      device('dc-sw-wh',     'switch', 60,  60,  { label: 'Warehouse Switch',       inputs: 4, outputs: 8 }),
      device('dc-ap',        'ap',     240, 60,  { label: 'Wi-Fi (industrial)',     capacity: '20 APs · QoS for scanners', inputs: 1, outputs: 6 }),
      device('dc-handhelds', 'client', 420, 60,  { label: 'RF Scanners / Handhelds',capacity: '120 devices' }),
      device('dc-conveyor',  'server', 60,  200, { label: 'Conveyor / Sortation PLC', capacity: 'OT · segmented VLAN', risk: 'high' }),
      device('dc-label',     'server', 240, 200, { label: 'Label / Receipt Printers',capacity: '40 printers' }),
      device('dc-cctv',      'client', 420, 200, { label: 'CCTV / Access Control' }),
      device('dc-voip',      'client', 60,  320, { label: 'VoIP Handsets' }),
      device('dc-pickup',    'client', 240, 320, { label: 'Pickup Locker / Kiosk' }),

      // Office
      device('dc-sw-off',    'switch', 60,  480, { label: 'Office Switch',          inputs: 2, outputs: 8 }),
      device('dc-users',     'client', 240, 480, { label: 'Office Workstations',    capacity: '60 seats' }),
      device('dc-print',     'server', 420, 480, { label: 'Office Print' }),
      device('dc-meeting',   'client', 240, 600, { label: 'Meeting Room AV' }),

      // DC Data Room
      device('dc-fw',        'firewall', 720, 60,  { label: 'DC Firewall', risk: 'medium' }),
      device('dc-sw-core',   'switch',   900, 60,  { label: 'DC Core Switch', inputs: 4, outputs: 8 }),
      device('dc-wms',       'server',   720, 200, { label: 'WMS (Warehouse Mgmt)',  capacity: 'Local read cache', risk: 'high' }),
      device('dc-tms',       'server',   900, 200, { label: 'TMS (Transport Mgmt)' }),
      device('dc-backup',    'server',   720, 320, { label: 'Local Backup / Staging',capacity: 'Feeds HQ → IRE' }),
      device('dc-mpls',      'router',   900, 320, { label: 'MPLS Edge',              capacity: 'Primary link to HQ', phase: 'Primary',  inputs: 2, outputs: 3 }),
      device('dc-sdwan',     'router',   720, 440, { label: 'SD-WAN Edge',            capacity: 'Overlay · Break-out', phase: 'Optional', inputs: 2, outputs: 3 }),
      device('dc-5g',        'ap',       900, 440, { label: '5G WAN Gateway',         capacity: 'Backup transport',    phase: 'Backup' }),

      // Management
      device('dc-jump',      'server', 720, 600, { label: 'Jump Host (PAM)' }),
      device('dc-monitor',   'server', 900, 600, { label: 'Monitoring Agent' }),
    ],
    edges: [
      // Warehouse network
      edge('w1', 'dc-ap',        'dc-sw-wh', 'network'),
      edge('w2', 'dc-handhelds', 'dc-ap',    'network', { label: 'Wi-Fi' }),
      edge('w3', 'dc-conveyor',  'dc-sw-wh', 'network'),
      edge('w4', 'dc-label',     'dc-sw-wh', 'network'),
      edge('w5', 'dc-cctv',      'dc-sw-wh', 'network'),
      edge('w6', 'dc-voip',      'dc-sw-wh', 'network'),
      edge('w7', 'dc-pickup',    'dc-sw-wh', 'network'),
      edge('w8', 'dc-sw-wh',     'dc-fw',    'network'),

      // Office
      edge('o1', 'dc-users',   'dc-sw-off', 'network'),
      edge('o2', 'dc-print',   'dc-sw-off', 'network'),
      edge('o3', 'dc-meeting', 'dc-sw-off', 'network'),
      edge('o4', 'dc-sw-off',  'dc-fw',     'network'),

      // DC core
      edge('d1', 'dc-fw',      'dc-sw-core', 'network'),
      edge('d2', 'dc-wms',     'dc-sw-core', 'network'),
      edge('d3', 'dc-tms',     'dc-sw-core', 'network'),
      edge('d4', 'dc-backup',  'dc-sw-core', 'network'),

      // WAN (primary + optional + backup), converging at the core switch
      edge('d5', 'dc-sw-core', 'dc-mpls',  'wan',     { label: 'Primary · MPLS to HQ' }),
      edge('d6', 'dc-sw-core', 'dc-sdwan', 'network', { label: 'Optional · SD-WAN overlay' }),
      edge('d7', 'dc-sw-core', 'dc-5g',    'wan',     { label: 'Backup · 5G' }),

      // Inter-site flows
      edge('w-erp',  'dc-mpls',   'dc-wms',   'network',     { label: 'WMS ↔ ERP (HQ)' }),
      edge('w-repl', 'dc-backup', 'dc-mpls',  'replication', { label: 'Backup → HQ / IRE' }),

      // Management
      edge('m1', 'dc-jump',    'dc-sw-core', 'management', { label: 'Admin' }),
      edge('m2', 'dc-jump',    'dc-sw-wh',   'management', { label: 'Admin' }),
      edge('m3', 'dc-monitor', 'dc-mpls',    'logs',       { label: 'Telemetry' }),
    ],
  },
};
