/**
 * Create a team account.
 *
 * The gradient-filled title text and matching button are gone; this is an
 * admin form, so it looks like the rest of the app. The form is kept narrow
 * because a single column of short fields is faster to fill than a wide one.
 */
import React, { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import axios from 'axios'

import { API } from '../auth'
import { SPACE } from '../theme'
import { EmptyState, Loading, PageHeader, Section } from '../ui'

const TOKEN_KEY = 'token'
const emptyForm = { name: '', email: '', password: '', phone: '', role: 'agent', tenant_id: '' }

const ROLE_HELP = {
  agent: 'Can add listings, manage their own leads, and record their own deals.',
  owner: 'Everything an agent can do, plus commission rates, all deals and the whole team.',
  sysadmin: 'Support access across every agency.',
}

export default function AddAgent() {
  const [me, setMe] = useState(null)
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}` })

  useEffect(() => {
    async function loadMe() {
      try {
        const resp = await axios.get(`${API}/auth/me`, { headers: authHeaders() })
        setMe(resp.data)
      } catch {
        setMe(null)
      } finally {
        setChecking(false)
      }
    }
    loadMe()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e) {
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
      setSuccess(`${created.role} account created for ${created.email}. Share the password with them directly.`)
      setForm(emptyForm)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not create the account. Check the fields and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <Loading label="Checking your access" />

  if (!me) {
    return (
      <Section>
        <EmptyState title="Please sign in" description="Your session has expired. Sign in again to continue." />
      </Section>
    )
  }

  if (me.role !== 'owner' && me.role !== 'sysadmin') {
    return (
      <Box>
        <PageHeader title="Team accounts" />
        <Section>
          <EmptyState
            title="Only owners can add accounts"
            description="Ask your agency owner to create an account for your colleague."
          />
        </Section>
      </Box>
    )
  }

  const roleOptions = me.role === 'sysadmin' ? ['sysadmin', 'owner', 'agent'] : ['owner', 'agent']
  const showTenantField = me.role === 'sysadmin' && form.role !== 'sysadmin'

  return (
    <Box>
      <PageHeader
        title="Team accounts"
        description="Create a sign-in for someone at your agency. They can change their password once they are in."
      />

      <Box sx={{ maxWidth: 610 /* Fibonacci */ }}>
        {success && (
          <Alert severity="success" sx={{ mb: `${SPACE.lg}px` }} onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: `${SPACE.lg}px` }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Section title="New account" padded>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.lg}px` }}>
            <TextField label="Full name" name="name" value={form.name} onChange={handleChange} fullWidth />
            <TextField label="Email" name="email" type="email" value={form.email} onChange={handleChange} required fullWidth />
            <TextField
              label="Temporary password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
              fullWidth
              autoComplete="new-password"
              helperText="At least 8 characters. Give it to them in person or over the phone, not by email."
            />
            <TextField label="Phone" name="phone" value={form.phone} onChange={handleChange} fullWidth />
            <TextField
              select
              label="Role"
              name="role"
              value={form.role}
              onChange={handleChange}
              required
              fullWidth
              helperText={ROLE_HELP[form.role]}
            >
              {roleOptions.map((r) => (
                <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>
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

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: `${SPACE.md}px`, mt: `${SPACE.sm}px` }}>
              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? 'Creating…' : 'Create account'}
              </Button>
            </Box>
          </Box>
        </Section>

        <Typography variant="caption" sx={{ display: 'block', mt: `${SPACE.lg}px`, color: 'text.secondary' }}>
          Accounts cannot be deleted from here yet. Ask a sysadmin if you need one removed.
        </Typography>
      </Box>
    </Box>
  )
}
