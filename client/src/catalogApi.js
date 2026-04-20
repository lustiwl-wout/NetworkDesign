const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

function crud(resource) {
  return {
    list:   ()         => req(`/${resource}`),
    get:    (id)       => req(`/${resource}/${id}`),
    create: (body)     => req(`/${resource}`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => req(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id)       => req(`/${resource}/${id}`, { method: 'DELETE' }),
  };
}

export const deviceTypesApi = crud('device-types');
export const zoneTypesApi   = crud('zone-types');
export const edgeKindsApi   = crud('edge-kinds');
