import { useState } from 'react';
import { authApi } from './authApi.js';

export default function LoginPage({ onAuthed, initialMfa = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [stage, setStage] = useState(initialMfa ? 'mfa' : 'creds');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { mfaRequired } = await authApi.login({ email, password });
      if (mfaRequired) setStage('mfa');
      else await finish();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try { await authApi.mfaVerify(mfaCode); await finish(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    if (onAuthed) onAuthed();
    else window.location.href = '/';
  };

  return (
    <div className="login-shell">
      <aside className="login-hero">
        <div className="login-hero-inner">
          <div className="login-brand">
            <HeroIcon />
            <span>Network Design</span>
          </div>

          <h1 className="login-headline">
            Architecture you can <em>show</em> the board.
          </h1>
          <p className="login-sub">
            Build enterprise network diagrams that work for engineers <b>and</b> executives.
            Start from a template, annotate the story, and export a deck-ready diagram.
          </p>

          <HeroDiagram />

          <ul className="login-features">
            <li><Check /> Bold, icon-first architecture views for the CIO</li>
            <li><Check /> Engineer mode with IPs, VLANs, ports &amp; protocols</li>
            <li><Check /> Reference templates for HQ, DC, branch shops &amp; IRE</li>
            <li><Check /> Enterprise-grade sign-in with two-factor auth</li>
          </ul>

          <div className="login-footer">
            <span>Accounts created by your administrator.</span>
          </div>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-card">
          {stage === 'mfa' ? (
            <form onSubmit={verifyMfa}>
              <div className="login-card-step">Step 2 of 2</div>
              <h2>Two-factor code</h2>
              <p className="hint">Enter the 6-digit code from your authenticator app.</p>
              <input
                autoFocus
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="6"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mfa-input"
              />
              {err && <div className="admin-error">{err}</div>}
              <button className="btn btn-lg" type="submit" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={submit}>
              <div className="login-card-step">Welcome back</div>
              <h2>Sign in</h2>
              <label>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@company.com"
              />
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              {err && <div className="admin-error">{err}</div>}
              <button className="btn btn-lg" type="submit" disabled={busy}>
                {busy ? '…' : 'Sign in'}
              </button>
              <p className="hint small">
                Lost your MFA device? Contact an administrator.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function HeroIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="hero-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="url(#hero-g)" />
      <circle cx="10" cy="10" r="2.4" fill="#0f172a" />
      <circle cx="22" cy="10" r="2.4" fill="#0f172a" />
      <circle cx="16" cy="22" r="2.4" fill="#0f172a" />
      <path d="M10 10 L16 22 L22 10" stroke="#0f172a" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
      <path d="M7 12 L11 16 L17 9" stroke="#22c55e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroDiagram() {
  return (
    <svg className="login-diagram" viewBox="0 0 480 220" aria-hidden="true">
      <defs>
        <linearGradient id="zone-prod" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" stopOpacity="0.22" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="zone-ire" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22c55e" stopOpacity="0.22" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <rect x="10"  y="20" width="200" height="180" rx="12" fill="url(#zone-prod)" stroke="#3b82f6" strokeDasharray="4 4" />
      <text x="22" y="14" fontSize="10" fontWeight="700" fill="#3b82f6" letterSpacing="0.1em">PRODUCTION</text>

      <rect x="270" y="20" width="200" height="180" rx="12" fill="url(#zone-ire)" stroke="#22c55e" strokeDasharray="4 4" />
      <text x="282" y="14" fontSize="10" fontWeight="700" fill="#22c55e" letterSpacing="0.1em">ISOLATED RECOVERY</text>

      {/* Devices as simple rounded squares with accent + letter */}
      {[
        { x: 40,  y: 60,  c: '#f59e0b', l: 'DB' },
        { x: 140, y: 60,  c: '#a78bfa', l: 'VM' },
        { x: 90,  y: 140, c: '#14b8a6', l: 'SW' },
        { x: 300, y: 60,  c: '#ef4444', l: 'FW' },
        { x: 400, y: 60,  c: '#f59e0b', l: 'DB' },
        { x: 350, y: 140, c: '#a78bfa', l: 'VM' },
      ].map((d, i) => (
        <g key={i}>
          <rect x={d.x - 18} y={d.y - 18} width="36" height="36" rx="8"
            fill={d.c} stroke="#f1f5f9" strokeWidth="1.5" />
          <text x={d.x} y={d.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{d.l}</text>
        </g>
      ))}

      {/* Edges within each zone (smoothstep-ish) */}
      <path d="M40 60 V 90 H 90 V 140"   stroke="#94a3b8" strokeWidth="1.5" fill="none" />
      <path d="M140 60 V 90 H 90"         stroke="#94a3b8" strokeWidth="1.5" fill="none" />
      <path d="M300 60 V 90 H 350 V 140"  stroke="#94a3b8" strokeWidth="1.5" fill="none" />
      <path d="M400 60 V 90 H 350"        stroke="#94a3b8" strokeWidth="1.5" fill="none" />

      {/* Air-gap / replication edge (animated dashed) */}
      <line x1="215" y1="110" x2="265" y2="110" stroke="#22c55e" strokeWidth="2" strokeDasharray="6 4">
        <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.1s" repeatCount="indefinite" />
      </line>
      <polygon points="265,110 258,106 258,114" fill="#22c55e" />
      <text x="240" y="102" textAnchor="middle" fontSize="9" fill="#22c55e" fontWeight="700">ONE-WAY</text>
    </svg>
  );
}
