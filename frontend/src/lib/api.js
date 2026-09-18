const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('zameen_user') || 'null')
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem('zameen_user')
    return
  }
  localStorage.setItem('zameen_user', JSON.stringify(user))
}

export async function api(path, options = {}) {
  const user = getStoredUser()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (user?.id) headers['X-User-Id'] = String(user.id)
  if (user?.account_id) headers['X-Account-Id'] = String(user.account_id)

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Request failed')
  }
  return data
}

export { API }

