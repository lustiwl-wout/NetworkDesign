const DARK = '#0f172a';
const LIGHT = '#f1f5f9';

function Router({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Router">
      <defs>
        <linearGradient id="rtr-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="6" y="30" width="52" height="22" rx="5" fill="url(#rtr-g)" stroke={LIGHT} strokeWidth="2" />
      <path d="M16 24 V12 M32 24 V6 M48 24 V12" stroke={LIGHT} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <polygon points="16,4  11,12 21,12" fill={LIGHT} />
      <polygon points="48,4  43,12 53,12" fill={LIGHT} />
      <polygon points="32,62 27,54 37,54" fill={LIGHT} />
      <circle cx="18" cy="41" r="2.5" fill={LIGHT} />
      <circle cx="26" cy="41" r="2.5" fill={LIGHT} />
      <circle cx="34" cy="41" r="2.5" fill={LIGHT} />
      <circle cx="42" cy="41" r="2.5" fill={LIGHT} />
    </svg>
  );
}

function Switch({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Switch">
      <rect x="4" y="22" width="56" height="24" rx="4" fill={accent} stroke={LIGHT} strokeWidth="2" opacity="0.85" />
      <rect x="4" y="22" width="56" height="6" fill={LIGHT} opacity="0.18" />
      {[9, 17, 25, 33, 41, 49].map((x) => (
        <rect key={x} x={x} y="33" width="6" height="8" rx="1" fill={LIGHT} />
      ))}
      <path d="M12 16 L12 10 L52 10 L52 16" stroke={LIGHT} strokeWidth="2" fill="none" />
      <polygon points="12,6 8,12 16,12" fill={LIGHT} />
      <polygon points="52,6 48,12 56,12" fill={LIGHT} />
      <polygon points="32,58 28,50 36,50" fill={LIGHT} />
    </svg>
  );
}

function Firewall({ accent }) {
  // Matches the router structure: hardware box with a small decoration above.
  // Router has antennas; firewall gets a compact shield-with-check badge.
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Firewall">
      <defs>
        <linearGradient id="fw-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Shield badge above the unit */}
      <path d="M32 6 L22 10 V18 C22 24 27 27 32 29 C37 27 42 24 42 18 V10 Z"
        fill={accent} stroke={LIGHT} strokeWidth="1.8" />
      <path d="M27 18 L30 21 L37 14"
        stroke={LIGHT} strokeWidth="2.2" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Hardware unit — same rect proportions as Router */}
      <rect x="8" y="34" width="48" height="20" rx="4" fill="url(#fw-g)" stroke={LIGHT} strokeWidth="2" />
      <rect x="8" y="34" width="48" height="5" fill={LIGHT} opacity="0.22" />
      <circle cx="16" cy="46" r="2" fill={LIGHT} />
      <circle cx="22" cy="46" r="2" fill={LIGHT} opacity="0.55" />
      <circle cx="28" cy="46" r="2" fill={LIGHT} opacity="0.3" />
      <rect x="42" y="44" width="10" height="4" rx="1" fill={LIGHT} opacity="0.35" />
    </svg>
  );
}

function Server({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Server">
      {[8, 24, 40].map((y) => (
        <g key={y}>
          <rect x="8" y={y} width="48" height="14" rx="3" fill={accent} stroke={LIGHT} strokeWidth="2" opacity="0.9" />
          <rect x="8" y={y} width="48" height="4" fill={LIGHT} opacity="0.18" />
          <circle cx="16" cy={y + 7} r="2" fill={LIGHT} />
          <circle cx="22" cy={y + 7} r="2" fill={LIGHT} opacity="0.45" />
          <rect x="32" y={y + 4} width="20" height="6" rx="1" fill={LIGHT} opacity="0.25" />
        </g>
      ))}
    </svg>
  );
}

function Client({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Client">
      <rect x="6" y="10" width="52" height="36" rx="3" fill={DARK} stroke={LIGHT} strokeWidth="2" />
      <rect x="10" y="14" width="44" height="26" rx="1" fill={accent} opacity="0.85" />
      <rect x="10" y="14" width="44" height="10" fill={LIGHT} opacity="0.15" />
      <rect x="24" y="48" width="16" height="3" fill={LIGHT} />
      <rect x="16" y="51" width="32" height="4" rx="1" fill={LIGHT} />
    </svg>
  );
}

function Cloud({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Cloud">
      <defs>
        <linearGradient id="cld-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="1" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path
        d="M18 46 Q6 46 6 34 Q6 22 18 22 Q20 10 32 10 Q46 10 48 24 Q58 24 58 36 Q58 46 46 46 Z"
        fill="url(#cld-g)" stroke={LIGHT} strokeWidth="2"
      />
      <path
        d="M22 34 Q22 30 26 30 Q28 26 32 26 Q38 26 40 32 Q44 32 44 36"
        stroke={LIGHT} strokeWidth="1.5" fill="none" opacity="0.5"
      />
    </svg>
  );
}

function AccessPoint({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Access Point">
      <path d="M32 38 Q14 38 6 22"  stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M32 38 Q50 38 58 22" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M32 34 Q20 30 14 14" stroke={accent} strokeWidth="2" fill="none" opacity="0.65" strokeLinecap="round" />
      <path d="M32 34 Q44 30 50 14" stroke={accent} strokeWidth="2" fill="none" opacity="0.65" strokeLinecap="round" />
      <path d="M32 30 Q26 22 24 8"  stroke={accent} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M32 30 Q38 22 40 8"  stroke={accent} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
      <rect x="14" y="40" width="36" height="14" rx="3" fill={accent} stroke={LIGHT} strokeWidth="2" />
      <circle cx="22" cy="47" r="2" fill={LIGHT} />
      <circle cx="30" cy="47" r="2" fill={LIGHT} opacity="0.55" />
      <circle cx="38" cy="47" r="2" fill={LIGHT} opacity="0.3" />
    </svg>
  );
}

function Database({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Database">
      <defs>
        <linearGradient id="db-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="1" />
          <stop offset="1" stopColor={accent} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="12" rx="22" ry="7" fill="url(#db-g)" stroke={LIGHT} strokeWidth="2" />
      <path d="M10 12 V28 Q10 35 32 35 Q54 35 54 28 V12" fill="url(#db-g)" stroke={LIGHT} strokeWidth="2" />
      <path d="M10 28 V44 Q10 51 32 51 Q54 51 54 44 V28" fill="url(#db-g)" stroke={LIGHT} strokeWidth="2" />
      <path d="M10 44 V56 Q10 62 32 62 Q54 62 54 56 V44" fill="url(#db-g)" stroke={LIGHT} strokeWidth="2" />
      <ellipse cx="32" cy="28" rx="22" ry="7" fill="none" stroke={LIGHT} strokeWidth="1" opacity="0.5" />
      <ellipse cx="32" cy="44" rx="22" ry="7" fill="none" stroke={LIGHT} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function LoadBalancer({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Load Balancer">
      <polygon points="32,4 60,32 32,60 4,32" fill={accent} stroke={LIGHT} strokeWidth="2" />
      <path d="M14 32 H50" stroke={LIGHT} strokeWidth="3" strokeLinecap="round" />
      <path d="M22 22 L14 32 L22 42" stroke={LIGHT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 22 L50 32 L42 42" stroke={LIGHT} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Generic({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Device">
      <rect x="8" y="8" width="48" height="48" rx="8" fill={accent} stroke={LIGHT} strokeWidth="2" />
      <circle cx="32" cy="32" r="8" fill={LIGHT} opacity="0.85" />
    </svg>
  );
}

function Hypervisor({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Hypervisor">
      <rect x="6" y="42" width="52" height="16" rx="3" fill={accent} stroke={LIGHT} strokeWidth="2" />
      <rect x="6" y="42" width="52" height="4" fill={LIGHT} opacity="0.2" />
      <circle cx="14" cy="50" r="2" fill={LIGHT} />
      <circle cx="20" cy="50" r="2" fill={LIGHT} opacity="0.5" />
      <rect x="8"  y="6"  width="22" height="14" rx="2" fill={LIGHT} opacity="0.85" stroke={LIGHT} strokeWidth="1.5" />
      <rect x="34" y="6"  width="22" height="14" rx="2" fill={LIGHT} opacity="0.55" stroke={LIGHT} strokeWidth="1.5" />
      <rect x="8"  y="24" width="22" height="14" rx="2" fill={LIGHT} opacity="0.55" stroke={LIGHT} strokeWidth="1.5" />
      <rect x="34" y="24" width="22" height="14" rx="2" fill={LIGHT} opacity="0.85" stroke={LIGHT} strokeWidth="1.5" />
      <rect x="12" y="10" width="10" height="2" fill={accent} />
      <rect x="38" y="10" width="10" height="2" fill={accent} />
      <rect x="12" y="28" width="10" height="2" fill={accent} />
      <rect x="38" y="28" width="10" height="2" fill={accent} />
    </svg>
  );
}

function VM({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Virtual Machine">
      <rect x="6" y="10" width="52" height="44" rx="6"
        fill={accent} stroke={LIGHT} strokeWidth="2"
        strokeDasharray="4 3" />
      <rect x="14" y="18" width="36" height="26" rx="3"
        fill={DARK} stroke={LIGHT} strokeWidth="1.5" />
      <rect x="14" y="18" width="36" height="6" fill={LIGHT} opacity="0.2" />
      <circle cx="18" cy="21" r="1.2" fill={accent} />
      <circle cx="22" cy="21" r="1.2" fill={LIGHT} opacity="0.6" />
      <rect x="18" y="28" width="18" height="2" fill={LIGHT} opacity="0.7" />
      <rect x="18" y="33" width="22" height="2" fill={LIGHT} opacity="0.45" />
      <rect x="18" y="38" width="14" height="2" fill={LIGHT} opacity="0.45" />
    </svg>
  );
}

function BoundaryIn({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Input boundary">
      <defs>
        <linearGradient id="bin-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.95" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="4" y="14" width="56" height="36" rx="6" fill="url(#bin-g)" stroke={LIGHT} strokeWidth="2" />
      <polygon points="12,24 12,40 26,32" fill={LIGHT} />
      <text x="32" y="37" fill={LIGHT} fontSize="13" fontWeight="800" letterSpacing="0.08em">IN</text>
    </svg>
  );
}

function BoundaryOut({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Output boundary">
      <defs>
        <linearGradient id="bout-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.95" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="4" y="14" width="56" height="36" rx="6" fill="url(#bout-g)" stroke={LIGHT} strokeWidth="2" />
      <text x="10" y="37" fill={LIGHT} fontSize="13" fontWeight="800" letterSpacing="0.08em">OUT</text>
      <polygon points="40,24 54,32 40,40" fill={LIGHT} />
    </svg>
  );
}

function Container({ accent }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Container">
      <rect x="6"  y="22" width="14" height="14" fill={accent} stroke={LIGHT} strokeWidth="1.5" />
      <rect x="22" y="22" width="14" height="14" fill={accent} stroke={LIGHT} strokeWidth="1.5" opacity="0.8" />
      <rect x="38" y="22" width="14" height="14" fill={accent} stroke={LIGHT} strokeWidth="1.5" opacity="0.6" />
      <rect x="14" y="38" width="14" height="14" fill={accent} stroke={LIGHT} strokeWidth="1.5" opacity="0.75" />
      <rect x="30" y="38" width="14" height="14" fill={accent} stroke={LIGHT} strokeWidth="1.5" opacity="0.55" />
      <path d="M8 12 Q32 4 56 12" stroke={LIGHT} strokeWidth="2" fill="none" />
      <circle cx="14" cy="12" r="1.8" fill={LIGHT} />
      <circle cx="32" cy="8"  r="1.8" fill={LIGHT} />
      <circle cx="50" cy="12" r="1.8" fill={LIGHT} />
    </svg>
  );
}

export const ICON_META = {
  router:         { accent: '#38bdf8', Component: Router },
  switch:         { accent: '#14b8a6', Component: Switch },
  firewall:       { accent: '#ef4444', Component: Firewall },
  server:         { accent: '#a78bfa', Component: Server },
  hypervisor:     { accent: '#7c3aed', Component: Hypervisor },
  vm:             { accent: '#c084fc', Component: VM },
  container:      { accent: '#2dd4bf', Component: Container },
  client:         { accent: '#64748b', Component: Client },
  cloud:          { accent: '#0ea5e9', Component: Cloud },
  ap:             { accent: '#22d3ee', Component: AccessPoint },
  database:       { accent: '#f59e0b', Component: Database },
  'load-balancer':{ accent: '#10b981', Component: LoadBalancer },
  generic:        { accent: '#94a3b8', Component: Generic },
};

export const ICON_KEYS = Object.keys(ICON_META);

export function iconAccent(iconKey) {
  return (ICON_META[iconKey] ?? ICON_META.generic).accent;
}

export default function DeviceIcon({ iconKey, size = 64 }) {
  const meta = ICON_META[iconKey] ?? ICON_META.generic;
  const Cmp = meta.Component;
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Cmp accent={meta.accent} />
    </div>
  );
}
