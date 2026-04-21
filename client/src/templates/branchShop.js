import { device, zone, edge, zoneSize } from './_shared.js';

const NET_X    = 0;
const NET_ROW  = 200;
const ZONE_X   = 260;
const ZONE_GAP = 60;

const netNode = (id, iconKey, y, data = {}) => ({
  id, type: 'device', position: { x: NET_X, y },
  data: { iconKey, ...data },
});

const Z = {
  front: zoneSize(3, 2),
  back:  zoneSize(3, 1),
};

const Z_FRONT = { x: ZONE_X, y: 0 };
const Z_BACK  = { x: ZONE_X, y: Z.front.height + ZONE_GAP };

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

      device('sh-pos1',    'client', 'z-front', 0, 0, { label: 'POS Terminal 1' }),
      device('sh-pos2',    'client', 'z-front', 1, 0, { label: 'POS Terminal 2' }),
      device('sh-kiosk',   'client', 'z-front', 2, 0, { label: 'Self-service Kiosk' }),
      device('sh-ap-pub',  'ap',     'z-front', 0, 1, { label: 'Wi-Fi (customer)' }),
      device('sh-cctv',    'client', 'z-front', 1, 1, { label: 'CCTV' }),
      device('sh-counter', 'client', 'z-front', 2, 1, { label: 'Counter Workstation' }),

      device('sh-ap-staff', 'ap',     'z-back', 0, 0, { label: 'Wi-Fi (staff)' }),
      device('sh-pickup',   'client', 'z-back', 1, 0, { label: 'Pickup Locker' }),
      device('sh-print',    'server', 'z-back', 2, 0, { label: 'Label / Receipt Printer' }),

      // Network fabric column
      netNode('sh-in',   'boundary-input',  0 * NET_ROW, { label: 'From HQ / DC', phase: 'Current' }),
      netNode('sh-out',  'boundary-output', 1 * NET_ROW, { label: 'To Customers', phase: 'Current' }),
      netNode('sh-fw',   'firewall',        2 * NET_ROW, { label: 'Branch Firewall' }),
      netNode('sh-mpls', 'router',          3 * NET_ROW, { label: 'MPLS Edge', capacity: 'Primary · to HQ', phase: 'Primary' }),
      netNode('sh-5g',   'ap',              4 * NET_ROW, { label: '5G Gateway', capacity: 'Backup', phase: 'Backup' }),
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
