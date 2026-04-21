import { device, zone, edge, zoneSize } from './_shared.js';

const Z = {
  front: zoneSize(3, 2),
  back:  zoneSize(3, 1),
};

const GAP   = 60;
const NET_X = 0;
const NET_W = 240;
const Z_X   = NET_X + NET_W + GAP;

const Z_FRONT = { x: Z_X, y: 0 };
const Z_BACK  = { x: Z_X, y: Z.front.height + GAP };

const netNode = (id, iconKey, x, y, data = {}) => ({
  id, type: 'device', position: { x, y },
  data: { iconKey, ...data },
});

const IN_X  = NET_X;
const OUT_X = NET_X + 140;
const NET_COL_X = NET_X + 70;

export default {
  id: 'branch-shop',
  name: 'Branch Shop / Trade Counter',
  description:
    'Local trade counter: workloads live in two zones (shop floor, back office). The network edge — firewall, MPLS primary, 5G backup — sits outside and routes traffic back to HQ. Stateless: ERP and stock live at HQ.',
  graph: {
    nodes: [
      zone('z-front', Z_FRONT.x, Z_FRONT.y, Z.front.width, Z.front.height,
        { color: '#3b82f6', label: 'Shop Floor', sublabel: 'POS · kiosk · Wi-Fi · CCTV' }),
      zone('z-back', Z_BACK.x, Z_BACK.y, Z.back.width, Z.back.height,
        { color: '#06b6d4', label: 'Back Office', sublabel: 'Staff Wi-Fi · pickup · printer' }),

      // Shop floor workloads
      device('sh-pos1',   'client', 'z-front', 0, 0, { label: 'POS Terminal 1' }),
      device('sh-pos2',   'client', 'z-front', 1, 0, { label: 'POS Terminal 2' }),
      device('sh-kiosk',  'client', 'z-front', 2, 0, { label: 'Self-service Kiosk', capacity: 'Stock lookup · pickup' }),
      device('sh-ap-pub', 'ap',     'z-front', 0, 1, { label: 'Wi-Fi (customer)', capacity: 'Guest SSID' }),
      device('sh-cctv',   'client', 'z-front', 1, 1, { label: 'CCTV' }),
      device('sh-counter','client', 'z-front', 2, 1, { label: 'Counter Workstation' }),

      // Back office workloads
      device('sh-ap-staff', 'ap',     'z-back', 0, 0, { label: 'Wi-Fi (staff)' }),
      device('sh-pickup',   'client', 'z-back', 1, 0, { label: 'Pickup Locker' }),
      device('sh-print',    'server', 'z-back', 2, 0, { label: 'Label / Receipt Printer' }),

      // Network fabric — outside any zone
      netNode('sh-in',   'boundary-input',  IN_X,   0,   { label: 'From HQ / DC',  phase: 'Current' }),
      netNode('sh-out',  'boundary-output', OUT_X,  0,   { label: 'To Customers',  phase: 'Current' }),
      netNode('sh-fw',   'firewall',        NET_COL_X, 140, { label: 'Branch Firewall' }),
      netNode('sh-mpls', 'router',          IN_X,   300, { label: 'MPLS Edge', capacity: 'Primary · to HQ', phase: 'Primary' }),
      netNode('sh-5g',   'ap',              OUT_X,  300, { label: '5G Gateway', capacity: 'Backup',          phase: 'Backup' }),
    ],
    edges: [
      edge('ext-in',  'sh-in', 'sh-fw',  'wan', { label: 'Inbound' }),
      edge('ext-out', 'sh-fw', 'sh-out', 'wan', { label: 'Outbound' }),

      edge('w1', 'sh-fw', 'z-front', 'network'),
      edge('w2', 'sh-fw', 'z-back',  'network'),

      edge('w3', 'sh-fw', 'sh-mpls', 'wan', { label: 'Primary · MPLS' }),
      edge('w4', 'sh-fw', 'sh-5g',   'wan', { label: 'Backup · 5G' }),
    ],
  },
};
