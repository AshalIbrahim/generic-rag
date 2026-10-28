import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { api, formatPKR } from '../auth'

const statusColor = { pending: 'warning', paid: 'success', cancelled: 'default' }

function StatCard({ label, value, hint }) {
  return (
    <Card sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  )
}

export default function Sales() {
  const [me, setMe] = useState(null)
  const [sales, setSales] = useState([])
  const [summary, setSummary] = useState({ agents: [], totals: {} })
  const [settings, setSettings] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // record-a-sale form
  const emptyForm = { property_id: '', sale_price: '', commission_rate_pct: '', lead_id: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [listing, setListing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const isOwner = me && (me.role === 'owner' || me.role === 'sysadmin')

  async function loadAll() {
    try {
      setLoading(true)
      const profile = await api('/auth/me')
      setMe(profile)
      const [s, sum, l] = await Promise.all([api('/sales'), api('/commissions/summary'), api('/leads')])
      setSales(s)
      setSummary(sum)
      setLeads(l)
      if (profile.role === 'owner' || profile.role === 'sysadmin') {
        setSettings(await api('/commissions/settings'))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Look the listing up when a property id is entered, so we can show a live commission preview.
  async function lookupListing() {
    setListing(null)
    setPreview(null)
    if (!form.property_id) return
    try {
      const data = await api(`/listings/${form.property_id}`)
      setListing(data)
    } catch (e) {
      setError(`Property #${form.property_id}: ${e.message}`)
    }
  }

  useEffect(() => {
    async function calc() {
      if (!listing) return setPreview(null)
      const price = form.sale_price !== '' ? form.sale_price : listing.price
      const q = new URLSearchParams({ price, purpose: listing.purpose })
      if (isOwner && form.commission_rate_pct !== '') q.set('rate_pct', form.commission_rate_pct)  // CHANGED: only the owner can override
      try {
        setPreview(await api(`/commissions/calculate?${q.toString()}`))
      } catch {
        setPreview(null)
      }
    }
    calc()
  }, [listing, form.sale_price, form.commission_rate_pct, isOwner])

  const change = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))
    setError('')
    setNotice('')
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const body = { property_id: parseInt(form.property_id, 10), notes: form.notes || null }
      if (form.sale_price !== '') body.sale_price = parseFloat(form.sale_price)
      if (isOwner && form.commission_rate_pct !== '') body.commission_rate_pct = parseFloat(form.commission_rate_pct)  // CHANGED
      if (form.lead_id !== '') body.lead_id = parseInt(form.lead_id, 10)
      const res = await api('/sales', { method: 'POST', body })
      setNotice(`Deal recorded. Agent commission: ${formatPKR(res.commission.agent_commission)}.`)
      setForm(emptyForm)
      setListing(null)
      setPreview(null)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id, status) {
    if (status === 'cancelled' && !window.confirm('Cancel this deal? The commission is removed from the totals.')) return
    try {
      await api(`/sales/${id}/status`, { method: 'PATCH', body: { status } })
      await loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveSettings() {
    try {
      setSettings(
        await api('/commissions/settings', {
          method: 'PUT',
          body: {
            sale_rate_pct: parseFloat(settings.sale_rate_pct),
            rent_rate_pct: parseFloat(settings.rent_rate_pct),
            agent_split_pct: parseFloat(settings.agent_split_pct),
          },
        })
      )
      setNotice('Commission settings saved. They apply to deals recorded from now on.')
    } catch (e) {
      setError(e.message)
    }
  }

  const t = summary.totals || {}
  const myRow = useMemo(() => (me ? summary.agents.find((a) => a.agent_id === me.id) : null), [summary, me])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Sales &amp; Commissions</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <StatCard label="Deals closed" value={(t.sales_count || 0) + (t.rentals_count || 0)} hint={`${t.sales_count || 0} sales · ${t.rentals_count || 0} rentals`} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Sales volume" value={formatPKR(t.sales_volume || 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            label={isOwner ? 'Agent commissions' : 'My commission'}
            value={formatPKR(isOwner ? t.agent_commission : myRow?.agent_commission || 0)}
            hint={`Pending ${formatPKR(isOwner ? t.agent_commission_pending : myRow?.agent_commission_pending || 0)}`}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            label={isOwner ? 'Agency commission' : 'Paid out to me'}
            value={formatPKR(isOwner ? t.agency_commission : myRow?.agent_commission_paid || 0)}
            hint={isOwner ? `Gross ${formatPKR(t.gross_commission)}` : undefined}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Record a closed deal</Typography>
        <Box component="form" onSubmit={submit}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField label="Property ID" name="property_id" type="number" value={form.property_id}
                onChange={change} onBlur={lookupListing} required fullWidth
                helperText={listing ? `${listing.prop_type} · ${listing.purpose} · ${listing.location} · listed ${formatPKR(listing.price)}` : 'The ID shown on the listing page'} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Final price (optional)" name="sale_price" type="number" value={form.sale_price}
                onChange={change} fullWidth helperText="Leave blank to use the listing price (monthly rent for rentals)" />
            </Grid>
            <Grid item xs={12} sm={4}>
              {/* CHANGED: filled from the agency's saved rate once the property is known; only the owner can change it */}
              {isOwner ? (
                <TextField label="Commission rate %" name="commission_rate_pct" type="number"
                  value={form.commission_rate_pct !== '' ? form.commission_rate_pct : (preview ? preview.rate_pct : '')}
                  onChange={change} fullWidth
                  helperText={settings ? `Agency default: ${settings.sale_rate_pct}% sale / ${settings.rent_rate_pct}% of a month's rent. Edit only to change this one deal.` : 'Filled from your agency settings'} />
              ) : (
                <TextField label="Commission rate %" type="number" value={preview ? preview.rate_pct : ''}
                  fullWidth disabled helperText="Set by your agency owner" />
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="Buyer / tenant lead (optional)" name="lead_id" value={form.lead_id} onChange={change} fullWidth
                helperText="Linking a lead marks it as won">
                <MenuItem value="">None</MenuItem>
                {leads.map((l) => (<MenuItem key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ''}</MenuItem>))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Notes" name="notes" value={form.notes} onChange={change} fullWidth />
            </Grid>
          </Grid>

          {preview && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {preview.rate_pct}% of {preview.basis === 'monthly_rent' ? "one month's rent" : 'the sale price'} = <strong>{formatPKR(preview.gross_commission)}</strong> gross.
              Agent ({preview.agent_split_pct}%): <strong>{formatPKR(preview.agent_commission)}</strong> · Agency: <strong>{formatPKR(preview.agency_commission)}</strong>
            </Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button type="submit" variant="contained" disabled={saving || !form.property_id}>
              {saving ? <CircularProgress size={22} color="inherit" /> : 'Record deal'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {isOwner && settings && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Commission settings</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sales: % of the sale price. Rentals: % of one month's rent (100% = one month). Agent share: the agent's cut of the commission; the agency keeps the rest.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['sale_rate_pct', 'Sale rate %'], ['rent_rate_pct', 'Rent rate %'], ['agent_split_pct', 'Agent share %']].map(([k, label]) => (
              <TextField key={k} label={label} type="number" size="small" value={settings[k]}
                onChange={(e) => setSettings((p) => ({ ...p, [k]: e.target.value }))} sx={{ width: 150 }} />
            ))}
            <Button variant="outlined" onClick={saveSettings}>Save</Button>
          </Box>
        </Paper>
      )}

      {isOwner && summary.agents.length > 0 && (
        <Paper sx={{ mb: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, p: 2 }}>Commission by agent</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Agent</TableCell><TableCell align="right">Deals</TableCell><TableCell align="right">Sales volume</TableCell>
                  <TableCell align="right">Gross</TableCell><TableCell align="right">Agent earns</TableCell>
                  <TableCell align="right">Pending</TableCell><TableCell align="right">Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.agents.map((a) => (
                  <TableRow key={a.agent_id}>
                    <TableCell>{a.agent_name || a.agent_email}</TableCell>
                    <TableCell align="right">{a.sales_count + a.rentals_count}</TableCell>
                    <TableCell align="right">{formatPKR(a.sales_volume)}</TableCell>
                    <TableCell align="right">{formatPKR(a.gross_commission)}</TableCell>
                    <TableCell align="right">{formatPKR(a.agent_commission)}</TableCell>
                    <TableCell align="right">{formatPKR(a.agent_commission_pending)}</TableCell>
                    <TableCell align="right">{formatPKR(a.agent_commission_paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Paper sx={{ borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, p: 2 }}>{isOwner ? 'All deals' : 'My deals'}</Typography>
        {sales.length === 0 ? (
          <Typography sx={{ px: 2, pb: 2 }} color="text.secondary">No deals recorded yet.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Closed</TableCell><TableCell>Property</TableCell>{isOwner && <TableCell>Agent</TableCell>}
                  <TableCell align="right">Price</TableCell><TableCell align="right">Commission</TableCell>
                  <TableCell align="right">Agent earns</TableCell><TableCell>Status</TableCell>{isOwner && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id} sx={{ opacity: s.status === 'cancelled' ? 0.5 : 1 }}>
                    <TableCell>{String(s.closed_at).slice(0, 10)}</TableCell>
                    <TableCell>#{s.property_id} · {s.prop_type} · {s.location || '—'} ({s.kind})</TableCell>
                    {isOwner && <TableCell>{s.agent_name || s.agent_email}</TableCell>}
                    <TableCell align="right">{formatPKR(s.sale_price)}</TableCell>
                    <TableCell align="right">{formatPKR(s.gross_commission)} <Typography component="span" variant="caption">({s.commission_rate_pct}%)</Typography></TableCell>
                    <TableCell align="right">{formatPKR(s.agent_commission)}</TableCell>
                    <TableCell><Chip size="small" label={s.status} color={statusColor[s.status] || 'default'} /></TableCell>
                    {isOwner && (
                      <TableCell align="right">
                        {s.status === 'pending' && <Button size="small" onClick={() => setStatus(s.id, 'paid')}>Mark paid</Button>}
                        {s.status === 'paid' && <Button size="small" onClick={() => setStatus(s.id, 'pending')}>Undo paid</Button>}
                        {s.status !== 'cancelled' && <Button size="small" color="error" onClick={() => setStatus(s.id, 'cancelled')}>Cancel</Button>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  )
}