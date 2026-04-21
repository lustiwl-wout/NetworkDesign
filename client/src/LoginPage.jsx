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
      else finish();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try { await authApi.mfaVerify(mfaCode); finish(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const finish = () => {
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
            <label>Code from your authenticator app</label>
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
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <h2>Sign in</h2>
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {err && <div className="admin-error">{err}</div>}
            <button className="btn btn-lg" type="submit" disabled={busy}>
              {busy ? '…' : 'Sign in'}
            </button>
            <a className="btn btn-lg btn-ghost" href="/">Continue as guest</a>
          </form>
        )}
      </div>
    </div>
  );
}
