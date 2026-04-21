const BASE = '/api/auth';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body; try { body = await res.json(); } catch { body = { error: res.statusText }; }
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const authApi = {
  login:    (body)   => req('/login',    { method: 'POST', body: JSON.stringify(body) }),
  logout:   ()       => req('/logout',   { method: 'POST' }),
  me:       ()       => req('/me'),
  mfaSetup:  ()      => req('/mfa/setup',   { method: 'POST' }),
  mfaEnable: (code)  => req('/mfa/enable',  { method: 'POST', body: JSON.stringify({ code }) }),
  mfaVerify: (code)  => req('/mfa/verify',  { method: 'POST', body: JSON.stringify({ code }) }),
  mfaDisable: (pw)   => req('/mfa/disable', { method: 'POST', body: JSON.stringify({ password: pw }) }),
  changePassword: (b) => req('/change-password', { method: 'POST', body: JSON.stringify(b) }),
  updatePreferences: (b) => req('/preferences', { method: 'POST', body: JSON.stringify(b) }),
};

const ADMIN_BASE = '/api/admin/users';
async function adminReq(path, options = {}) {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body; try { body = await res.json(); } catch { body = { error: res.statusText }; }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function visitsReq(path, options = {}) {
  const res = await fetch(`/api/admin/visits${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body; try { body = await res.json(); } catch { body = { error: res.statusText }; }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
export const visitsAdminApi = {
  list: () => visitsReq(''),
};

export const usersAdminApi = {
  list:   ()              => adminReq(''),
  create: (body)          => adminReq('', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body)      => adminReq(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetMfa:     (id)      => adminReq(`/${id}/reset-mfa`,     { method: 'POST' }),
  resetPassword:(id, pw)  => adminReq(`/${id}/reset-password`,{ method: 'POST', body: JSON.stringify({ newPassword: pw }) }),
  remove: (id)            => adminReq(`/${id}`, { method: 'DELETE' }),
};
