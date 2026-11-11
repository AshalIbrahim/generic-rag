/**
 * Sales and commissions.
 *
 * The figures that were four floating cards are now one summary strip, and the
 * live commission preview sits beside the form rather than below it, so you can
 * see what a deal pays before you commit it.
 */
import React, { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { api } from '../auth'
import { SPACE, palette } from '../theme'
import { EmptyState, FieldRow, Loading, PageHeader, Section, Stat, StatRow, StatusChip } from '../ui'
import { formatDate, formatPKR } from '../ui/format'

const emptyForm = { property_id: '', sale_price: '', commission_rate_pct: '', lead_id: '', notes: '' }

export default function Sales() {
  const [me, setMe] = useState(null)
  const [sales, setSales] = useState([])
  const [summary, setSummary] = useState({ agents: [], totals: {} })
  const [settings, setSettings] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState(emptyForm)
  const [listing, setListing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(null)

  const isOwner = me && (me.role === 'owner' || me.role === 'sysadmin')

  async function loadAll() {
    try {
      setLoading(true)
      const profile = await api('/auth/me')
      setMe(profile)
      const [s, sum, l] = await Promise.all([api('/sales'), api('/commissions/summary'), api('/leads')])
      setSales(Array.isArray(s) ? s : [])
      setSummary(sum || { agents: [], totals: {} })
      setLeads(Array.isArray(l) ? l : [])
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

  async function lookupListing() {
    setListing(null)
    setPreview(null)
    if (!form.property_id) return
    try {
      setListing(await api(`/listings/${form.property_id}`))
    } catch (e) {
      setError(`Property #${form.property_id}: ${e.message}`)
    }
  }

  useEffect(() => {
    async function calc() {
      if (!listing) return setPreview(null)
      const price = form.sale_price !== '' ? form.sale_price : listing.price
      const q = new URLSearchParams({ price, purpose: listing.purpose })
      if (isOwner && form.commission_rate_pct !== '') q.set('rate_pct', form.commission_rate_pct)
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
      if (isOwner && form.commission_rate_pct !== '') body.commission_rate_pct = parseFloat(form.commission_rate_pct)
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
  const myRow = useMemo(
    () => (me ? (summary.agents || []).find((a) => a.agent_id === me.id) : null),
    [summary, me]
  )

  if (loading) {
    return (
      <Box>
        <PageHeader title="Sales & commissions" />
        <Loading label="Loading deals" />
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title="Sales & commissions"
        description={
          isOwner
            ? 'Every deal the agency has closed, and what each agent has earned.'
            : 'The deals you have closed, and what you have earned on them.'
        }
      />

      <Box sx={{ mb: `${SPACE.xl}px` }}>
        <StatRow>
          <Stat
            label="Deals closed"
            value={(t.sales_count || 0) + (t.rentals_count || 0)}
            hint={`${t.sales_count || 0} sales · ${t.rentals_count || 0} rentals`}
          />
          <Stat label="Sales volume" value={formatPKR(t.sales_volume || 0)} />
          <Stat
            label={isOwner ? 'Agent commissions' : 'My commission'}
            value={formatPKR(isOwner ? t.agent_commission : myRow?.agent_commission || 0)}
            hint={`${formatPKR(isOwner ? t.agent_commission_pending : myRow?.agent_commission_pending || 0)} still pending`}
          />
          <Stat
            label={isOwner ? 'Agency keeps' : 'Paid out to me'}
            value={formatPKR(isOwner ? t.agency_commission : myRow?.agent_commission_paid || 0)}
            hint={isOwner ? `${formatPKR(t.gross_commission)} gross` : undefined}
          />
        </StatRow>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: `${SPACE.lg}px` }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: `${SPACE.lg}px` }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {/* ------------------------------------------------- record a deal */}
      <Section
        title="Record a closed deal"
        description="Enter the property and the final price. The commission split is worked out from your agency's rates."
        sx={{ mb: `${SPACE.xl}px` }}
      >
        <Box
          component="form"
          onSubmit={submit}
          sx={{
            display: 'grid',
            // 61.8 / 38.2: the form, then what it will pay.
            gridTemplateColumns: { xs: '1fr', lg: '61.8fr 38.2fr' },
          }}
        >
          <Box sx={{ p: `${SPACE.xl}px` }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: `${SPACE.lg}px` }}>
              <TextField
                label="Property ID"
                name="property_id"
                type="number"
                value={form.property_id}
                onChange={change}
                onBlur={lookupListing}
                required
                fullWidth
                helperText={
                  listing
                    ? `${listing.prop_type} · ${listing.location} · listed at ${formatPKR(listing.price)}`
                    : 'The number shown on the listing page'
                }
              />
              <TextField
                label="Final price"
                name="sale_price"
                type="number"
                value={form.sale_price}
                onChange={change}
                fullWidth
                helperText="Leave blank to use the listed price"
              />
              {isOwner ? (
                <TextField
                  label="Commission rate %"
                  name="commission_rate_pct"
                  type="number"
                  value={form.commission_rate_pct !== '' ? form.commission_rate_pct : preview ? preview.rate_pct : ''}
                  onChange={change}
                  fullWidth
                  helperText={
                    settings
                      ? `Agency default ${settings.sale_rate_pct}% sale / ${settings.rent_rate_pct}% rent`
                      : 'From your agency settings'
                  }
                />
              ) : (
                <TextField
                  label="Commission rate %"
                  type="number"
                  value={preview ? preview.rate_pct : ''}
                  fullWidth
                  disabled
                  helperText="Set by your agency owner"
                />
              )}
              <TextField
                select
                label="Buyer or tenant"
                name="lead_id"
                value={form.lead_id}
                onChange={change}
                fullWidth
                helperText="Linking a lead marks it as won"
              >
                <MenuItem value="">Not linked</MenuItem>
                {leads.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                    {l.phone ? ` · ${l.phone}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                <TextField label="Notes" name="notes" value={form.notes} onChange={change} fullWidth />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: `${SPACE.xl}px` }}>
              <Button type="submit" variant="contained" disabled={saving || !form.property_id}>
                {saving ? 'Recording…' : 'Record deal'}
              </Button>
            </Box>
          </Box>

          {/* What this deal pays */}
          <Box
            sx={{
              p: `${SPACE.xl}px`,
              bgcolor: palette.surfaceSunken,
              borderLeft: { lg: `1px solid ${palette.border}` },
              borderTop: { xs: `1px solid ${palette.border}`, lg: 'none' },
            }}
          >
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: `${SPACE.md}px` }}>
              What this pays
            </Typography>
            {preview ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: `${SPACE.lg}px` }}>
                  {preview.rate_pct}% of{' '}
                  {preview.basis === 'monthly_rent' ? "one month's rent" : 'the sale price'}
                </Typography>
                <FieldRow label="Gross commission" value={<span className="tnum">{formatPKR(preview.gross_commission)}</span>} />
                <FieldRow
                  label={`Agent (${preview.agent_split_pct}%)`}
                  value={<span className="tnum">{formatPKR(preview.agent_commission)}</span>}
                />
                <FieldRow label="Agency" value={<span className="tnum">{formatPKR(preview.agency_commission)}</span>} />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Enter a property ID and the split appears here before you save.
              </Typography>
            )}
          </Box>
        </Box>
      </Section>

      {/* ---------------------------------------------------- settings */}
      {isOwner && settings && (
        <Section
          title="Commission settings"
          description="Sales take a percentage of the sale price. Rentals take a percentage of one month's rent, so 100% is a full month. The agent share is their cut; the agency keeps the rest."
          padded
          sx={{ mb: `${SPACE.xl}px` }}
          actions={
            <Button variant="outlined" onClick={saveSettings}>
              Save rates
            </Button>
          }
        >
          <Box sx={{ display: 'flex', gap: `${SPACE.lg}px`, flexWrap: 'wrap' }}>
            {[
              ['sale_rate_pct', 'Sale rate %'],
              ['rent_rate_pct', 'Rent rate %'],
              ['agent_split_pct', 'Agent share %'],
            ].map(([k, label]) => (
              <TextField
                key={k}
                label={label}
                type="number"
                value={settings[k]}
                onChange={(e) => setSettings((p) => ({ ...p, [k]: e.target.value }))}
                sx={{ width: 144 }}
              />
            ))}
          </Box>
        </Section>
      )}

      {/* ------------------------------------------- commission by agent */}
      {isOwner && (summary.agents || []).length > 0 && (
        <Section title="Commission by agent" sx={{ mb: `${SPACE.xl}px` }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Deals</TableCell>
                  <TableCell align="right">Volume</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell align="right">Agent earns</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.agents.map((a) => (
                  <TableRow key={a.agent_id} hover>
                    <TableCell sx={{ fontWeight: 550 }}>{a.agent_name || a.agent_email}</TableCell>
                    <TableCell align="right" className="tnum">
                      {a.sales_count + a.rentals_count}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatPKR(a.sales_volume)}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatPKR(a.gross_commission)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 600 }}>
                      {formatPKR(a.agent_commission)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ color: 'warning.main' }}>
                      {formatPKR(a.agent_commission_pending)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ color: 'text.secondary' }}>
                      {formatPKR(a.agent_commission_paid)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      )}

      {/* --------------------------------------------------------- deals */}
      <Section title={isOwner ? 'All deals' : 'My deals'}>
        {sales.length === 0 ? (
          <EmptyState
            title="No deals recorded yet"
            description="When you close something, record it above and it will show here with the commission worked out."
            compact
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Closed</TableCell>
                  <TableCell>Property</TableCell>
                  {isOwner && <TableCell>Agent</TableCell>}
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Commission</TableCell>
                  <TableCell align="right">Agent earns</TableCell>
                  <TableCell>Status</TableCell>
                  {isOwner && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id} hover sx={{ opacity: s.status === 'cancelled' ? 0.55 : 1 }}>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                      {formatDate(s.closed_at)}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 550 }}>
                        {s.prop_type} · {s.location || '—'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        #{s.property_id} · {s.kind}
                      </Typography>
                    </TableCell>
                    {isOwner && (
                      <TableCell sx={{ color: 'text.secondary' }}>{s.agent_name || s.agent_email}</TableCell>
                    )}
                    <TableCell align="right" className="tnum" sx={{ whiteSpace: 'nowrap' }}>
                      {formatPKR(s.sale_price)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ whiteSpace: 'nowrap' }}>
                      {formatPKR(s.gross_commission)}
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {s.commission_rate_pct}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatPKR(s.agent_commission)}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={s.status} />
                    </TableCell>
                    {isOwner && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {s.status === 'pending' && (
                          <Button size="small" variant="outlined" onClick={() => setStatus(s.id, 'paid')}>
                            Mark paid
                          </Button>
                        )}
                        {s.status === 'paid' && (
                          <Button size="small" variant="text" onClick={() => setStatus(s.id, 'pending')}>
                            Undo
                          </Button>
                        )}
                        {s.status !== 'cancelled' && (
                          <Button size="small" color="error" variant="text" onClick={() => setConfirmCancel(s)}>
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      {/* window.confirm replaced: it cannot be styled and looks like a browser
          warning rather than part of the app. */}
      <Dialog open={Boolean(confirmCancel)} onClose={() => setConfirmCancel(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel this deal?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 13.5 }}>
            {confirmCancel && (
              <>
                #{confirmCancel.property_id} · {confirmCancel.prop_type} ·{' '}
                {formatPKR(confirmCancel.sale_price)}. Its commission comes out of the totals. You can set it back to
                pending afterwards.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancel(null)}>Keep it</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setStatus(confirmCancel.id, 'cancelled')
              setConfirmCancel(null)
            }}
          >
            Cancel deal
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
