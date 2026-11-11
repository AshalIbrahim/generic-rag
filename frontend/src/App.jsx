import React, { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

import AppShell from './components/AppShell'
import { API, api, authHeaders } from './auth'

import Listings from './pages/Listings'
import Locations from './pages/Locations'
import ChatBotPage from './pages/ChatBotPage'
import DbChatPage from './pages/DbChatPage'
import AddListing from './pages/AddListing'
import AddAgent from './pages/AddAgent'
import Login from './pages/Login'
import PropertyDetails from './pages/PropertyDetails'
import Sales from './pages/Sales'
import Leads from './pages/Leads'
import Performance from './pages/Performance'

export default function App() {
  const [filterLocation, setFilterLocation] = useState(null)
  const [user, setUser] = useState(null)
  // The token lives in localStorage but the user object did not, so every
  // refresh dropped you back to the login screen while still holding a valid
  // token. Re-reading the session on boot fixes that.
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!localStorage.getItem('token')) {
        setBooting(false)
        return
      }
      try {
        const me = await api('/auth/me')
        if (!cancelled) setUser(me)
      } catch {
        // Expired or rejected: drop it rather than retrying on every page.
        localStorage.removeItem('token')
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = useCallback(async () => {
    const id = user?.id
    // Clear locally first: the session must end even if the request fails.
    localStorage.removeItem('token')
    setUser(null)
    setFilterLocation(null)
    if (id === undefined || id === null) return
    try {
      await fetch(`${API}/auth/logout?user_id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: authHeaders(),
      })
    } catch {
      /* already signed out on this device */
    }
  }, [user])

  if (booting) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  if (!user) {
    return <Login onLoginSuccess={setUser} />
  }

  return (
    <AppShell user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Listings filterLocation={filterLocation} />} />
        <Route path="/locations" element={<Locations onSelectLocation={setFilterLocation} />} />
        <Route path="/property/:id" element={<PropertyDetails user={user} />} />
        <Route path="/add-listing" element={<AddListing />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/chatbot" element={<ChatBotPage />} />
        <Route path="/chat-db" element={<DbChatPage />} />
        <Route path="/add-agent" element={<AddAgent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
