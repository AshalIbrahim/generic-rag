// Shared helper: the JWT that Login.jsx saves under 'token'.
export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export function authHeaders(extra = {}) {
  const token = localStorage.getItem('token') || ''
  return { Authorization: `Bearer ${token}`, ...extra }
}

// Small fetch wrapper for the CRM pages.
// Returns parsed JSON, or throws an Error whose message can be shown as-is.
export async function api(path, { method = 'GET', body } = {}) {
  let resp
  try {
    resp = await fetch(`${API}${path}`, {
      method,
      headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // A network failure throws the browser's own "Failed to fetch", which was
    // being shown to users verbatim. They need to know it is the connection,
    // not their data.
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = data.detail
    if (typeof detail === 'string') throw new Error(detail)
    // FastAPI validation errors come back as a list of objects; those are for
    // developers, not for the person using the app.
    if (resp.status === 401) throw new Error('Your session has expired. Sign in again.')
    if (resp.status === 403) throw new Error('You do not have access to this.')
    if (resp.status === 404) throw new Error('That could not be found.')
    if (resp.status === 429) throw new Error('Too many requests. Wait a moment and try again.')
    if (resp.status >= 500) throw new Error('The server had a problem. Try again in a moment.')
    throw new Error('Something went wrong. Please try again.')
  }
  return data
}

// Formatting moved to src/ui/format.js so every page shows a price the same
// way. Re-exported here because the CRM pages already import it from this file.
export { formatPKR, formatPKRCompact, formatNumber, formatArea } from './ui/format'
