import { useState } from 'react';
import { authApi } from './authApi.js';

export default function ProfilePage({ me, onChange }) {
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const flash = (message) => { setMsg(message); setTimeout(() => setMsg(null), 2500); };

  return (
    <div className="admin">
      <header className="admin-topbar">
        <h1>Profile</h1>
        <div className="spacer" />
        <a className="btn secondary" href="/">← Back to editor</a>
        <button className="btn secondary" onClick={async () => { await authApi.logout(); window.location.href = '/login'; }}>
          Sign out
        </button>
      </header>
      <main className="admin-main">
        <div className="profile-grid">
          <section className="admin-form">
            <h2>Account</h2>
            <p className="hint">
              {me.email}<br />
              <strong>
                {me.role === 'admin' ? 'Administrator'
                  : me.role === 'viewer' ? 'Viewer (demo, no save)'
                  : 'User'}
              </strong>
            </p>
          </section>

          <PreferencesSection me={me} onChange={onChange} onMessage={flash} onError={setErr} />
          <MfaSection me={me} onChange={onChange} onMessage={flash} onError={setErr} />
          <PasswordSection onMessage={flash} onError={setErr} />

          {err && <div className="admin-error">{err}</div>}
          {msg && <div className="toast" style={{ position: 'fixed' }}>{msg}</div>}
        </div>
      </main>
    </div>
  );
}

function PreferencesSection({ me, onChange, onMessage, onError }) {
  const [view, setView] = useState(me.defaultView ?? 'management');
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    onError(null);
    setBusy(true);
    try {
      await authApi.updatePreferences({ defaultView: next });
      setView(next);
      onMessage(next === 'engineering'
        ? 'Default view set to Engineering'
        : 'Default view set to Management');
      if (onChange) onChange();
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="admin-form">
      <h2>Preferences</h2>
      <p className="hint">
        Pick the view you open the editor in. Management is clean and
        business-focused; Engineering exposes IP addresses, VLANs,
        hostnames and protocols. You can still toggle per-session in the
        topbar.
      </p>
      <label>Default view</label>
      <select
        value={view}
        onChange={(e) => save(e.target.value)}
        disabled={busy}
      >
        <option value="management">Management</option>
        <option value="engineering">Engineering</option>
      </select>
    </section>
  );
}

function MfaSection({ me, onChange, onMessage, onError }) {
  const [setup, setSetup] = useState(null); // { qrDataUrl, secret } while enrolling
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    onError(null);
    try { setSetup(await authApi.mfaSetup()); }
    catch (e) { onError(e.message); }
  };

  const confirmEnable = async (e) => {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await authApi.mfaEnable(code);
      setSetup(null);
      setCode('');
      onMessage('Two-factor authentication enabled');
      if (onChange) onChange();
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  };

  const disable = async (e) => {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await authApi.mfaDisable(disablePw);
      setDisablePw('');
      onMessage('Two-factor authentication disabled');
      if (onChange) onChange();
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="admin-form">
      <h2>Two-factor authentication</h2>
      {me.totpEnabled ? (
        <>
          <p className="hint">MFA is <strong style={{ color: '#22c55e' }}>enabled</strong>. To disable, confirm your password.</p>
          <form onSubmit={disable} className="form">
            <label>Current password</label>
            <input
              type="password"
              required
              value={disablePw}
              onChange={(e) => setDisablePw(e.target.value)}
            />
            <button className="btn danger" type="submit" disabled={busy}>Disable MFA</button>
          </form>
        </>
      ) : setup ? (
        <>
          <p className="hint">
            Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password…),
            then enter the 6-digit code to confirm.
          </p>
          <div className="qr-box">
            <img src={setup.qrDataUrl} alt="Scan this QR with your authenticator app" />
            <code>{setup.secret}</code>
          </div>
          <form onSubmit={confirmEnable} className="form">
            <label>Code from app</label>
            <input
              autoFocus
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength="6"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
            />
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setSetup(null)}>Cancel</button>
              <button type="submit" className="btn" disabled={busy}>Enable MFA</button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="hint">
            Add an extra step at sign-in using an authenticator app. Strongly recommended for admins.
          </p>
          <button className="btn" onClick={startSetup}>Set up MFA</button>
        </>
      )}
    </section>
  );
}

function PasswordSection({ onMessage, onError }) {
  const [curr, setCurr] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword: curr, newPassword: next });
      setCurr(''); setNext('');
      onMessage('Password changed');
    } catch (e) { onError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="admin-form">
      <h2>Change password</h2>
      <form onSubmit={submit} className="form">
        <label>Current password</label>
        <input type="password" required value={curr} onChange={(e) => setCurr(e.target.value)} />
        <label>New password (min 8 chars)</label>
        <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>Update password</button>
      </form>
    </section>
  );
}
