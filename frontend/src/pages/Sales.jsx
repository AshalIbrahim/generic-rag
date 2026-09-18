import React, { useEffect, useState } from 'react'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

const emptySale = { property_id: '', buyer_name: '', buyer_email: '', buyer_phone: '', sold_price: '', commission_rate: '', closing_date: '', notes: '' }

export default function Sales() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptySale)
  const [error, setError] = useState('')
  const load = () => api('/app/v1/sales').then(setRows).catch((e) => setError(e.message))
  useEffect(load, [])

  async function submit(e) {
    e.preventDefault()
    try {
      await api('/app/v1/sales', { method: 'POST', body: JSON.stringify(clean(form)) })
      setForm(emptySale)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Sales</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper component="form" onSubmit={submit} sx={{ p: 2, mb: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
        {Object.keys(emptySale).map((field) => (
          <TextField key={field} label={label(field)} type={['property_id', 'sold_price', 'commission_rate'].includes(field) ? 'number' : field === 'closing_date' ? 'date' : 'text'} InputLabelProps={field === 'closing_date' ? { shrink: true } : undefined} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={['property_id', 'buyer_name', 'sold_price'].includes(field)} size="small" />
        ))}
        <Button type="submit" variant="contained">Record sale</Button>
      </Paper>
      <ResourceTable rows={rows} columns={[
        { key: 'property_id', label: 'Property' },
        { key: 'buyer_name', label: 'Buyer' },
        { key: 'sold_price', label: 'Sold price' },
        { key: 'commission_amount', label: 'Commission' },
        { key: 'closing_date', label: 'Closing date' },
      ]} />
    </Box>
  )
}

function clean(form) {
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
}

function label(field) {
  return field.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
}

