const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  list:   ()            => request('/designs'),
  get:    (id)          => request(`/designs/${id}`),
  create: (body)        => request('/designs', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body)    => request(`/designs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id)          => request(`/designs/${id}`, { method: 'DELETE' }),
};
