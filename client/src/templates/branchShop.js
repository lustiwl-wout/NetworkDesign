import { device, zone, edge } from './_shared.js';

export default {
  id: 'branch-shop',
  name: 'Branch Shop / Trade Counter',
  description:
    'Local trade counter for walk-in customers and pickup. Lean footprint: POS, counter workstations, Wi-Fi, CCTV. Connectivity: MPLS (primary) · SD-WAN (optional) · 5G (backup). All business logic lives at HQ; this site is stateless.',
  graph: {
    nodes: [
      zone('z-front',  0,   0,   520, 320, { color: '#3b82f6', label: 'Shop Floor',  sublabel: 'Counter + customer area' }),
      zone('z-back',   0,   340, 520, 240, { color: '#06b6d4', label: 'Back Office',  sublabel: 'Staff / stockroom' }),
      zone('z-wan',    560, 0,   400, 420, { color: '#f59e0b', label: 'WAN Edge',     sublabel: 'Link to HQ / DC' }),
      zone('z-mgmt',   560, 440, 400, 200, { color: '#94a3b8', label: 'Management' }),

      // Shop floor
      device('sh-sw',      'switch', 60,  60,  { label: 'Shop Switch',     inputs: 2, outputs: 8 }),
      device('sh-pos1',    'client', 240, 60,  { label: 'POS Terminal 1' }),
      device('sh-pos2',    'client', 380, 60,  { label: 'POS Terminal 2' }),
      device('sh-kiosk',   'client', 60,  200, { label: 'Self-service Kiosk', capacity: 'Stock lookup · order pickup' }),
      device('sh-ap-pub',  'ap',     240, 200, { label: 'Wi-Fi (customer)',    capacity: 'Guest SSID' }),
      device('sh-cctv',    'client', 380, 200, { label: 'CCTV' }),

      // Back office
      device('sh-ap-staff','ap',     60,  380, { label: 'Wi-Fi (staff)' }),
      device('sh-pickup',  'client', 240, 380, { label: 'Pickup Locker' }),
      device('sh-print',   'server', 380, 380, { label: 'Label / Receipt Printer' }),
      device('sh-phone',   'client', 60,  500, { label: 'VoIP Handset' }),
      device('sh-office',  'client', 240, 500, { label: 'Counter Workstation' }),

      // WAN edge
      device('sh-fw',      'firewall', 620, 40,  { label: 'Branch Firewall' }),
      device('sh-mpls',    'router',   780, 40,  { label: 'MPLS Edge',     capacity: 'Primary · to HQ / DC', phase: 'Primary',  inputs: 1, outputs: 2 }),
      device('sh-sdwan',   'router',   620, 160, { label: 'SD-WAN Edge',   capacity: 'Overlay · Break-out',  phase: 'Optional', inputs: 1, outputs: 2 }),
      device('sh-5g',      'ap',       780, 160, { label: '5G WAN Gateway',capacity: 'Backup transport',     phase: 'Backup' }),
      device('sh-hq',      'cloud',    700, 300, { label: 'To HQ / DC',     capacity: 'ERP, stock, identity' }),

      // Management
      device('sh-monitor', 'server', 620, 480, { label: 'Monitoring Agent' }),
      device('sh-jump',    'server', 780, 480, { label: 'Remote Support (via HQ)' }),
    ],
    edges: [
      // LAN
      edge('s1', 'sh-pos1',     'sh-sw', 'network'),
      edge('s2', 'sh-pos2',     'sh-sw', 'network'),
      edge('s3', 'sh-kiosk',    'sh-sw', 'network'),
      edge('s4', 'sh-ap-pub',   'sh-sw', 'network'),
      edge('s5', 'sh-cctv',     'sh-sw', 'network'),
      edge('s6', 'sh-ap-staff', 'sh-sw', 'network'),
      edge('s7', 'sh-pickup',   'sh-sw', 'network'),
      edge('s8', 'sh-print',    'sh-sw', 'network'),
      edge('s9', 'sh-phone',    'sh-sw', 'network'),
      edge('s10','sh-office',   'sh-sw', 'network'),

      // LAN → Firewall → WAN transports (all three fan out from the firewall)
      edge('w1', 'sh-sw',    'sh-fw',    'network'),
      edge('w2', 'sh-fw',    'sh-mpls',  'wan',     { label: 'Primary · MPLS' }),
      edge('w3', 'sh-fw',    'sh-sdwan', 'network', { label: 'Optional · SD-WAN' }),
      edge('w4', 'sh-fw',    'sh-5g',    'wan',     { label: 'Backup · 5G' }),
      edge('w5', 'sh-mpls',  'sh-hq',    'wan',     { label: 'Private circuit' }),
      edge('w6', 'sh-sdwan', 'sh-hq',    'wan',     { label: 'Overlay' }),
      edge('w7', 'sh-5g',    'sh-hq',    'wan',     { label: 'Failover' }),

      // Management
      edge('m1', 'sh-monitor', 'sh-mpls', 'logs',       { label: 'Telemetry' }),
      edge('m2', 'sh-jump',    'sh-fw',   'management', { label: 'Remote admin from HQ' }),
    ],
  },
};
