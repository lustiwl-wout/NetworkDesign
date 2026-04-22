const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`${res.status}: ${text}`);
    err.status = res.status;
    throw err;
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
  // Bulk folder ops — rename every design currently in `from` to
  // `to` (null unfiles them), or delete a folder entirely which
  // just unfiles every design in it.
  renameFolder: (from, to)  => request('/designs/folders/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
  deleteFolder: (name)      => request(`/designs/folders/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // Per-design sharing
  listDesignShares:   (id)            => request(`/designs/${id}/shares`),
  shareDesign:        (id, email)     => request(`/designs/${id}/shares`, { method: 'POST', body: JSON.stringify({ email }) }),
  unshareDesign:      (id, userId)    => request(`/designs/${id}/shares/${userId}`, { method: 'DELETE' }),

  // Folder-level sharing (scoped to the caller's own folders)
  listFolderShares:   (name)          => request(`/designs/folders/${encodeURIComponent(name)}/shares`),
  shareFolder:        (name, email)   => request(`/designs/folders/${encodeURIComponent(name)}/shares`, { method: 'POST', body: JSON.stringify({ email }) }),
  unshareFolder:      (name, userId)  => request(`/designs/folders/${encodeURIComponent(name)}/shares/${userId}`, { method: 'DELETE' }),
};
