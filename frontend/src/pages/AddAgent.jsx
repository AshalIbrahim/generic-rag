import React, { useEffect, useState } from 'react'
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// Must match the key Login.jsx saves the token under (see the one-line change below).
const TOKEN_KEY = 'token'

const emptyForm = { name: '', email: '', password: '', phone: '', role: 'agent', tenant_id: '' }

export default function AddAgent() {
  const [me, setMe] = useState(null)
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}`,
  })

  useEffect(() => {
    loadMe()
  }, [])

  async function loadMe() {
    try {
      const resp = await axios.get(`${API}/auth/me`, { headers: authHeaders() })
      setMe(resp.data)
    } catch (err) {
      setMe(null)
    } finally {
      setChecking(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const payload = {
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      name: form.name.trim() || null,
      phone: form.phone.trim() || null,
    }

    // Only a sysadmin picks the tenant, and only for owner/agent accounts.
    // For owners the server uses their own tenant and ignores the choice.
    if (me.role === 'sysadmin' && form.role !== 'sysadmin') {
      const tenantId = parseInt(form.tenant_id, 10)
      if (Number.isNaN(tenantId)) {
        setError('Enter the tenant ID this account belongs to.')
        return
      }
      payload.tenant_id = tenantId
    }

    setLoading(true)
    try {
      const resp = await axios.post(`${API}/agents/add`, payload, { headers: authHeaders() })
      const created = resp.data.account
      setSuccess(`${created.role} account created for ${created.email}`)
      setForm(emptyForm)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        typeof detail === 'string' ? detail : 'Could not create the account. Please check the fields and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!me) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="warning">Please log in to continue.</Alert>
      </Container>
    )
  }

  if (me.role !== 'owner' && me.role !== 'sysadmin') {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="info">Only owners and sysadmins can add accounts.</Alert>
      </Container>
    )
  }

  const roleOptions = me.role === 'sysadmin' ? ['sysadmin', 'owner', 'agent'] : ['owner', 'agent']
  const showTenantField = me.role === 'sysadmin' && form.role !== 'sysadmin'

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 6 }}>
      <Paper elevation={8} sx={{ p: 4, borderRadius: 4 }}>
        <Typography
          variant="h4"
          sx={{
            mb: 3,
            fontWeight: 700,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Add Agent
        </Typography>

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField label="Full name" name="name" value={form.name} onChange={handleChange} fullWidth />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            fullWidth
          />
          <TextField
            label="Temporary password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
            fullWidth
            autoComplete="new-password"
            helperText="At least 8 characters. Share it with the new user directly."
          />
          <TextField label="Phone (optional)" name="phone" value={form.phone} onChange={handleChange} fullWidth />
          <TextField select label="Role" name="role" value={form.role} onChange={handleChange} required fullWidth>
            {roleOptions.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>

          {showTenantField && (
            <TextField
              label="Tenant ID"
              name="tenant_id"
              type="number"
              value={form.tenant_id}
              onChange={handleChange}
              required
              fullWidth
              helperText="The agency this account belongs to."
            />
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                minWidth: 140,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:disabled': { background: '#ccc' },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  )
}
