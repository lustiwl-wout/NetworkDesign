import { useState } from 'react';
import { authApi } from './authApi.js';

export default function LoginPage({ mode = 'login', onAuthed, initialMfa = false }) {
  const [tab, setTab] = useState(mode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [stage, setStage] = useState(initialMfa ? 'mfa' : 'creds'); // 'creds' | 'mfa'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (tab === 'register') {
        await authApi.register({ email, password, displayName });
        await finish();
      } else {
        const { mfaRequired } = await authApi.login({ email, password });
        if (mfaRequired) setStage('mfa');
        else await finish();
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await authApi.mfaVerify(mfaCode);
      await finish();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    if (onAuthed) onAuthed();
    else window.location.href = '/';
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Network Design</h1>

        {stage === 'mfa' ? (
          <form onSubmit={verifyMfa}>
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
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        ) : (
          <>
            <div className="tabs">
              <button
                className={`tab${tab === 'login' ? ' active' : ''}`}
                onClick={() => setTab('login')}
              >Sign in</button>
              <button
                className={`tab${tab === 'register' ? ' active' : ''}`}
                onClick={() => setTab('register')}
              >Register</button>
            </div>

            <form onSubmit={submit}>
              {tab === 'register' && (
                <>
                  <label>Display name (optional)</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </>
              )}
              <label>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <label>Password</label>
              <input
                type="password"
                required
                minLength={tab === 'register' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              />
              {err && <div className="admin-error">{err}</div>}
              <button className="btn" type="submit" disabled={busy}>
                {busy ? '…' : tab === 'register' ? 'Create account' : 'Sign in'}
              </button>
              {tab === 'register' && (
                <p className="hint small">
                  The first registered user becomes an administrator.
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
