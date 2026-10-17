// Shared helper: the JWT that Login.jsx saves under 'token'.
export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export function authHeaders(extra = {}) {
  const token = localStorage.getItem('token') || ''
  return { Authorization: `Bearer ${token}`, ...extra }
}

// Small fetch wrapper for the new Sales / Leads / Performance pages.
// Returns parsed JSON, or throws an Error whose message is the server's "detail".
export async function api(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = data.detail
    throw new Error(typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
  }
  return data
}

export const formatPKR = (value) => {
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
}
