import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  front: zoneSize(3, 2),
  back:  zoneSize(3, 1),
  wan:   zoneSize(2, 2),
  mgmt:  zoneSize(2, 1),
};

const GAP = 40;
const Z_FRONT = { x: 0, y: 0 };
const Z_BACK  = { x: 0, y: Z.front.height + GAP };
const Z_WAN   = { x: Z.front.width + GAP, y: 0 };
const Z_MGMT  = { x: Z.front.width + GAP, y: Z.wan.height + GAP };

export default {
  id: 'branch-shop',
  name: 'Branch Shop / Trade Counter',
  description:
    'Local trade counter for walk-in customers and pickup. Lean footprint: POS, counter workstations, Wi-Fi, CCTV. Connectivity: MPLS (primary), 5G (backup). Stateless — ERP and stock live at HQ.',
  graph: {
    nodes: [
      zone('z-front', Z_FRONT.x, Z_FRONT.y, Z.front.width, Z.front.height,
        { color: '#3b82f6', label: 'Shop Floor',  sublabel: 'Counter + customer area' }),
      zone('z-back',  Z_BACK.x,  Z_BACK.y,  Z.back.width,  Z.back.height,
        { color: '#06b6d4', label: 'Back Office', sublabel: 'Staff / stockroom' }),
      zone('z-wan',   Z_WAN.x,   Z_WAN.y,   Z.wan.width,   Z.wan.height,
        { color: '#f59e0b', label: 'WAN Edge',     sublabel: 'Link to HQ / DC' }),
      zone('z-mgmt',  Z_MGMT.x,  Z_MGMT.y,  Z.mgmt.width,  Z.mgmt.height,
        { color: '#94a3b8', label: 'Management' }),

      // Shop floor (3x2)
      device('sh-sw',     'switch', 'z-front', 0, 0, { label: 'Shop Switch',    inputs: 2, outputs: 8 }),
      device('sh-pos1',   'client', 'z-front', 1, 0, { label: 'POS Terminal 1' }),
      device('sh-pos2',   'client', 'z-front', 2, 0, { label: 'POS Terminal 2' }),
      device('sh-kiosk',  'client', 'z-front', 0, 1, { label: 'Self-service Kiosk', capacity: 'Stock lookup · pickup' }),
      device('sh-ap-pub', 'ap',     'z-front', 1, 1, { label: 'Wi-Fi (customer)',   capacity: 'Guest SSID' }),
      device('sh-cctv',   'client', 'z-front', 2, 1, { label: 'CCTV' }),

      // Back office (3x1)
      device('sh-ap-staff','ap',     'z-back', 0, 0, { label: 'Wi-Fi (staff)' }),
      device('sh-pickup',  'client', 'z-back', 1, 0, { label: 'Pickup Locker' }),
      device('sh-print',   'server', 'z-back', 2, 0, { label: 'Label / Receipt Printer' }),

      // WAN edge (2x2)
      device('sh-fw',   'firewall', 'z-wan', 0, 0, { label: 'Branch Firewall' }),
      device('sh-hq',   'cloud',    'z-wan', 1, 0, { label: 'To HQ / DC',      capacity: 'ERP, stock, identity' }),
      device('sh-mpls', 'router',   'z-wan', 0, 1, { label: 'MPLS Edge',        capacity: 'Primary · to HQ / DC', phase: 'Primary' }),
      device('sh-5g',   'ap',       'z-wan', 1, 1, { label: '5G WAN Gateway',   capacity: 'Backup transport',      phase: 'Backup' }),

      // Management (2x1)
      device('sh-monitor', 'server', 'z-mgmt', 0, 0, { label: 'Monitoring Agent' }),
      device('sh-jump',    'server', 'z-mgmt', 1, 0, { label: 'Remote Support (via HQ)' }),
    ],
    edges: [
      // Shop LAN
      edge('s1', 'sh-pos1',    'sh-sw', 'network'),
      edge('s2', 'sh-pos2',    'sh-sw', 'network'),
      edge('s3', 'sh-kiosk',   'sh-sw', 'network'),
      edge('s4', 'sh-ap-pub',  'sh-sw', 'network'),
      edge('s5', 'sh-cctv',    'sh-sw', 'network'),

      // Back office
      edge('b1', 'sh-ap-staff','sh-sw', 'network'),
      edge('b2', 'sh-pickup',  'sh-sw', 'network'),
      edge('b3', 'sh-print',   'sh-sw', 'network'),

      // LAN → Firewall → transports (no SD-WAN)
      edge('w1', 'sh-sw',   'sh-fw',   'network'),
      edge('w2', 'sh-fw',   'sh-mpls', 'wan', { label: 'Primary · MPLS' }),
      edge('w3', 'sh-fw',   'sh-5g',   'wan', { label: 'Backup · 5G' }),
      edge('w4', 'sh-mpls', 'sh-hq',   'wan', { label: 'Private circuit' }),
      edge('w5', 'sh-5g',   'sh-hq',   'wan', { label: 'Failover' }),

      // Management
      edge('m1', 'sh-monitor', 'sh-mpls', 'logs',       { label: 'Telemetry' }),
      edge('m2', 'sh-jump',    'sh-fw',   'management', { label: 'Remote admin from HQ' }),
    ],
  },
};
