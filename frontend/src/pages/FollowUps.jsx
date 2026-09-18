import React, { useEffect, useState } from 'react'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

export default function FollowUps() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ lead_id: '', title: '', due_at: '', notes: '' })
  const [error, setError] = useState('')
  const load = () => api('/app/v1/follow-ups').then(setRows).catch((e) => setError(e.message))
  useEffect(load, [])

  async function submit(e) {
    e.preventDefault()
    try {
      await api('/app/v1/follow-ups', { method: 'POST', body: JSON.stringify({ ...form, lead_id: Number(form.lead_id) }) })
      setForm({ lead_id: '', title: '', due_at: '', notes: '' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Follow-ups</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper component="form" onSubmit={submit} sx={{ p: 2, mb: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
        <TextField label="Lead ID" type="number" value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} required size="small" />
        <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required size="small" />
        <TextField label="Due at" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} required size="small" />
        <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} size="small" />
        <Button type="submit" variant="contained">Schedule</Button>
      </Paper>
      <ResourceTable rows={rows} columns={[
        { key: 'lead_id', label: 'Lead' },
        { key: 'title', label: 'Title' },
        { key: 'due_at', label: 'Due' },
        { key: 'status', label: 'Status' },
        { key: 'id', label: 'Action', render: (row) => row.status === 'done' ? 'Done' : <Button size="small" onClick={() => api(`/app/v1/follow-ups/${row.id}/done`, { method: 'POST' }).then(load)}>Done</Button> },
      ]} />
    </Box>
  )
}

