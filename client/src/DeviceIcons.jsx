const STROKE = '#e2e8f0';
const FILL = '#273449';
const ACCENT = '#38bdf8';

function Router() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Router">
      <rect x="8" y="28" width="48" height="20" rx="4" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <circle cx="16" cy="38" r="2" fill={ACCENT} />
      <circle cx="22" cy="38" r="2" fill={ACCENT} />
      <circle cx="28" cy="38" r="2" fill={ACCENT} />
      <path d="M20 22 L20 14 M32 22 L32 10 M44 22 L44 14" stroke={STROKE} strokeWidth="2" fill="none" />
      <polygon points="20,10 17,14 23,14" fill={STROKE} />
      <polygon points="32,6 29,10 35,10" fill={STROKE} />
      <polygon points="44,10 41,14 47,14" fill={STROKE} />
    </svg>
  );
}

function Switch() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Switch">
      <rect x="6" y="24" width="52" height="20" rx="3" fill={FILL} stroke={STROKE} strokeWidth="2" />
      {[12, 20, 28, 36, 44, 52].map((x) => (
        <rect key={x} x={x - 2} y="32" width="4" height="6" fill={ACCENT} />
      ))}
      <path d="M14 18 L14 14 L50 14 L50 18" stroke={STROKE} strokeWidth="1.5" fill="none" />
      <polygon points="14,14 11,18 17,18" fill={STROKE} />
      <polygon points="50,14 47,18 53,18" fill={STROKE} />
    </svg>
  );
}

function Firewall() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Firewall">
      <rect x="10" y="14" width="44" height="36" fill={FILL} stroke={STROKE} strokeWidth="2" />
      {[
        [10, 14, 14, 8], [24, 14, 16, 8], [40, 14, 14, 8],
        [10, 22, 10, 8], [20, 22, 16, 8], [36, 22, 16, 8], [52, 22, 2, 8],
        [10, 30, 14, 8], [24, 30, 16, 8], [40, 30, 14, 8],
        [10, 38, 10, 8], [20, 38, 16, 8], [36, 38, 16, 8], [52, 38, 2, 8],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke={STROKE} strokeWidth="1" />
      ))}
      <path d="M32 20 L32 44" stroke={ACCENT} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="4" fill={ACCENT} />
    </svg>
  );
}

function Server() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Server">
      {[12, 26, 40].map((y) => (
        <g key={y}>
          <rect x="12" y={y} width="40" height="10" rx="2" fill={FILL} stroke={STROKE} strokeWidth="2" />
          <circle cx="18" cy={y + 5} r="1.5" fill={ACCENT} />
          <circle cx="24" cy={y + 5} r="1.5" fill={STROKE} />
          <rect x="32" y={y + 3} width="16" height="4" fill={STROKE} opacity="0.25" />
        </g>
      ))}
    </svg>
  );
}

function Client() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Client">
      <rect x="8" y="12" width="48" height="32" rx="2" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <rect x="12" y="16" width="40" height="22" fill={ACCENT} opacity="0.25" />
      <rect x="24" y="46" width="16" height="4" fill={STROKE} />
      <rect x="18" y="50" width="28" height="3" rx="1" fill={STROKE} />
    </svg>
  );
}

function Cloud() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Cloud">
      <path
        d="M18 44 Q8 44 8 34 Q8 24 18 24 Q20 14 32 14 Q44 14 46 26 Q56 26 56 36 Q56 44 46 44 Z"
        fill={FILL} stroke={STROKE} strokeWidth="2"
      />
    </svg>
  );
}

function AccessPoint() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Access Point">
      <rect x="16" y="36" width="32" height="12" rx="2" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <circle cx="24" cy="42" r="1.5" fill={ACCENT} />
      <circle cx="30" cy="42" r="1.5" fill={ACCENT} />
      <path d="M32 30 Q20 30 14 22" stroke={STROKE} strokeWidth="2" fill="none" />
      <path d="M32 30 Q44 30 50 22" stroke={STROKE} strokeWidth="2" fill="none" />
      <path d="M32 28 Q22 26 18 16" stroke={STROKE} strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M32 28 Q42 26 46 16" stroke={STROKE} strokeWidth="1.5" fill="none" opacity="0.6" />
      <circle cx="32" cy="32" r="2" fill={ACCENT} />
    </svg>
  );
}

function Database() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Database">
      <ellipse cx="32" cy="16" rx="18" ry="6" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <path d="M14 16 L14 32 Q14 38 32 38 Q50 38 50 32 L50 16" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <path d="M14 32 L14 48 Q14 54 32 54 Q50 54 50 48 L50 32" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="18" ry="6" fill="none" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

function LoadBalancer() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" role="img" aria-label="Load Balancer">
      <polygon points="32,8 58,32 32,56 6,32" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <path d="M18 32 L46 32" stroke={ACCENT} strokeWidth="2" />
      <path d="M32 20 L46 32 L32 44" stroke={ACCENT} strokeWidth="2" fill="none" />
      <circle cx="18" cy="32" r="3" fill={ACCENT} />
    </svg>
  );
}

const ICONS = {
  router: Router,
  switch: Switch,
  firewall: Firewall,
  server: Server,
  client: Client,
  cloud: Cloud,
  ap: AccessPoint,
  database: Database,
  'load-balancer': LoadBalancer,
};

export default function DeviceIcon({ type, size = 48 }) {
  const Cmp = ICONS[type];
  if (!Cmp) return null;
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Cmp />
    </div>
  );
}
