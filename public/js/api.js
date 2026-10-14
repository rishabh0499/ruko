// API calls. On localhost / Cloud Run they go to the Node server; in the shareable artifact
// (window.RUKO_STATIC) the same application core runs in the browser via localapi.js.
const STATIC = typeof window !== 'undefined' && !!window.RUKO_STATIC;
let local;
const localApi = () => (local ||= import('./localapi.js'));

export async function api(method, path, body) {
  if (STATIC) {
    const r = await (await localApi()).request(method, '/api' + path, body);
    if (r.status >= 400) throw new Error(r.json?.error || `Request failed (${r.status})`);
    return r.json ?? {};
  }
  const res = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const del = (p) => api('DELETE', p);

// Binary responses (voice audio). Returns a Blob or null.
export async function postBlob(path, body) {
  if (STATIC) {
    const r = await (await localApi()).request('POST', '/api' + path, body);
    return r.status === 200 && r.binary ? r.binary : null;
  }
  const res = await fetch('/api' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.status === 200 ? res.blob() : null;
}
