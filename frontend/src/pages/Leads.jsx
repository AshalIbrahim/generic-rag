import React, { useEffect, useState } from 'react'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

const emptyLead = { full_name: '', email: '', phone: '', status: 'new', budget_min: '', budget_max: '', preferred_location: '', notes: '' }

export default function Leads() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyLead)
  const [error, setError] = useState('')

  const load = () => api('/app/v1/leads').then(setRows).catch((e) => setError(e.message))
  useEffect(load, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/app/v1/leads', { method: 'POST', body: JSON.stringify(clean(form)) })
      setForm(emptyLead)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Leads</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper component="form" onSubmit={submit} sx={{ p: 2, mb: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
        {['full_name', 'email', 'phone', 'preferred_location'].map((field) => (
          <TextField key={field} label={label(field)} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={field === 'full_name'} size="small" />
        ))}
        <TextField label="Budget min" type="number" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} size="small" />
        <TextField label="Budget max" type="number" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} size="small" />
        <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} size="small" />
        <Button type="submit" variant="contained">Add lead</Button>
      </Paper>
      <ResourceTable columns={[
        { key: 'full_name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'preferred_location', label: 'Location' },
      ]} rows={rows} />
    </Box>
  )
}

function clean(form) {
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
}

function label(field) {
  return field.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
}

