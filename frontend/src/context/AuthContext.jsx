import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, API, getStoredUser, setStoredUser } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(Boolean(user))

  useEffect(() => {
    let active = true
    async function loadAccount() {
      if (!user?.id) {
        setAccount(null)
        setLoading(false)
        return
      }
      try {
        const me = await api('/app/v1/auth/me')
        if (active) setAccount(me)
      } catch {
        if (active) setAccount(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadAccount()
    return () => {
      active = false
    }
  }, [user?.id])

  async function signIn(email, password) {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || 'Invalid email or password.')
    setStoredUser(data)
    setUser(data)
    return data
  }

  async function signOut() {
    try {
      if (user?.id) {
        await fetch(`${API}/auth/logout?user_id=${encodeURIComponent(user.id)}`, { method: 'POST' })
      }
    } catch {}
    setStoredUser(null)
    setUser(null)
    setAccount(null)
  }

  const value = useMemo(() => ({ user, account, loading, signIn, signOut }), [user, account, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

