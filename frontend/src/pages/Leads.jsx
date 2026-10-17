import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { api, formatPKR } from '../auth'

const STATUSES = ['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost']
const CHANNELS = ['call', 'whatsapp', 'sms', 'email', 'meeting']
const statusColor = { new: 'default', contacted: 'info', viewing: 'info', negotiation: 'warning', won: 'success', lost: 'error' }

const emptyLead = { name: '', phone: '', email: '', bday: '', income: '', is_investor: false, notes: '' }

const fmtDateTime = (v) => (v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export default function Leads() {
  const [tab, setTab] = useState(0)
  const [leads, setLeads] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [view, setView] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')

  const [leadDialog, setLeadDialog] = useState(false)
  const [leadForm, setLeadForm] = useState(emptyLead)
  const [fuDialog, setFuDialog] = useState(null) // the lead a follow-up is being added to
  const [fuForm, setFuForm] = useState({ due_at: '', channel: 'call', note: '' })

  async function load() {
    try {
      setLoading(true)
      const [l, f, b] = await Promise.all([
        api(`/leads${query ? `?q=${encodeURIComponent(query)}` : ''}`),
        api(`/follow-ups?view=${view}`),
        api('/leads/birthdays?days=30'),
      ])
      setLeads(l)
      setFollowUps(f)
      setBirthdays(b)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query])

  async function saveLead() {
    try {
      const body = {
        name: leadForm.name,
        phone: leadForm.phone || null,
        email: leadForm.email || null,
        notes: leadForm.notes || null,
        bday: leadForm.bday || null,
        income: leadForm.income !== '' ? parseFloat(leadForm.income) : null,
        is_investor: leadForm.is_investor,
      }
      await api('/leads', { method: 'POST', body })
      setLeadDialog(false)
      setLeadForm(emptyLead)
      setNotice('Lead added.')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function changeStatus(id, status) {
    try {
      await api(`/leads/${id}`, { method: 'PUT', body: { status } })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveFollowUp() {
    try {
      await api(`/leads/${fuDialog.id}/follow-ups`, {
        method: 'POST',
        body: {
          due_at: new Date(fuForm.due_at).toISOString(),
          channel: fuForm.channel || null,
          note: fuForm.note || null,
        },
      })
      setFuDialog(null)
      setFuForm({ due_at: '', channel: 'call', note: '' })
      setNotice('Follow-up scheduled.')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function completeFollowUp(id) {
    const outcome = window.prompt('How did it go? (optional)') // simple and quick; replace with a dialog if you prefer
    if (outcome === null) return
    try {
      await api(`/follow-ups/${id}/complete`, { method: 'PATCH', body: { outcome: outcome || null } })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Leads &amp; Follow-ups</Typography>
        <Button variant="contained" onClick={() => setLeadDialog(true)}>Add lead</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Leads (${leads.length})`} />
        <Tab label="Follow-ups" />
        <Tab label={`Birthdays (${birthdays.length})`} />
      </Tabs>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /></Box>}

      {tab === 0 && (
        <Paper sx={{ borderRadius: 3 }}>
          <Box sx={{ p: 2 }}>
            <TextField size="small" label="Search name / phone / email" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ width: 320 }} />
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell><TableCell>Contact</TableCell><TableCell>Profile</TableCell>
                  <TableCell>Status</TableCell><TableCell>Next follow-up</TableCell><TableCell>Agent</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={7}><Typography color="text.secondary">No leads yet.</Typography></TableCell></TableRow>
                )}
                {leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.name}</TableCell>
                    <TableCell>{[l.phone, l.email].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell>
                      {l.is_investor && <Chip size="small" label="Investor" sx={{ mr: 0.5 }} />}
                      {l.income ? <Typography component="span" variant="caption">income {formatPKR(l.income)}</Typography> : null}
                    </TableCell>
                    <TableCell>
                      <TextField select size="small" value={l.status || 'new'} onChange={(e) => changeStatus(l.id, e.target.value)} sx={{ minWidth: 130 }}>
                        {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                      </TextField>
                    </TableCell>
                    <TableCell>{fmtDateTime(l.next_follow_up)}</TableCell>
                    <TableCell>{l.agent_name || '—'}</TableCell>
                    <TableCell align="right"><Button size="small" onClick={() => setFuDialog(l)}>+ Follow-up</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 1 && (
        <Paper sx={{ borderRadius: 3 }}>
          <Box sx={{ p: 2 }}>
            <TextField select size="small" label="Show" value={view} onChange={(e) => setView(e.target.value)} sx={{ width: 200 }}>
              <MenuItem value="pending">All pending</MenuItem>
              <MenuItem value="today">Due today</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="done">Completed</MenuItem>
              <MenuItem value="all">Everything</MenuItem>
            </TextField>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Due</TableCell><TableCell>Lead</TableCell><TableCell>How</TableCell><TableCell>Note</TableCell>
                  <TableCell>Agent</TableCell><TableCell>Status</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {followUps.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={7}><Typography color="text.secondary">Nothing here.</Typography></TableCell></TableRow>
                )}
                {followUps.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell sx={{ color: f.is_overdue ? 'error.main' : 'inherit', fontWeight: f.is_overdue ? 700 : 400 }}>{fmtDateTime(f.due_at)}</TableCell>
                    <TableCell>{f.lead_name}{f.lead_phone ? ` · ${f.lead_phone}` : ''}</TableCell>
                    <TableCell>{f.channel || '—'}</TableCell>
                    <TableCell>{f.note || '—'}{f.outcome ? ` → ${f.outcome}` : ''}</TableCell>
                    <TableCell>{f.agent_name || '—'}</TableCell>
                    <TableCell><Chip size="small" label={f.status === 'pending' && f.is_overdue ? 'overdue' : f.status} color={f.status === 'done' ? 'success' : f.is_overdue ? 'error' : 'default'} /></TableCell>
                    <TableCell align="right">{f.status === 'pending' && <Button size="small" onClick={() => completeFollowUp(f.id)}>Mark done</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 2 && (
        <Paper sx={{ borderRadius: 3, p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Birthdays in the next 30 days — a good excuse for a personal call or message.</Typography>
          {birthdays.length === 0 && !loading && <Typography color="text.secondary">No upcoming birthdays.</Typography>}
          {birthdays.map((b) => (
            <Box key={b.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography>{b.name}{b.phone ? ` · ${b.phone}` : ''} {b.is_investor && <Chip size="small" label="Investor" sx={{ ml: 1 }} />}</Typography>
              <Typography color={b.days_until === 0 ? 'success.main' : 'text.secondary'} sx={{ fontWeight: b.days_until === 0 ? 700 : 400 }}>
                {b.days_until === 0 ? 'Today! 🎂' : b.days_until === 1 ? 'Tomorrow' : `in ${b.days_until} days`}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}

      {/* Add lead */}
      <Dialog open={leadDialog} onClose={() => setLeadDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add lead</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}><TextField label="Name" required fullWidth value={leadForm.name} onChange={(e) => setLeadForm((p) => ({ ...p, name: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField label="Phone" fullWidth value={leadForm.phone} onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField label="Email" fullWidth value={leadForm.email} onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField label="Birthday" type="date" InputLabelProps={{ shrink: true }} fullWidth value={leadForm.bday} onChange={(e) => setLeadForm((p) => ({ ...p, bday: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField label="Monthly income (PKR)" type="number" fullWidth value={leadForm.income} onChange={(e) => setLeadForm((p) => ({ ...p, income: e.target.value }))} /></Grid>
            <Grid item xs={12}><FormControlLabel control={<Checkbox checked={leadForm.is_investor} onChange={(e) => setLeadForm((p) => ({ ...p, is_investor: e.target.checked }))} />} label="Investor" /></Grid>
            <Grid item xs={12}><TextField label="Notes" multiline rows={2} fullWidth value={leadForm.notes} onChange={(e) => setLeadForm((p) => ({ ...p, notes: e.target.value }))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeadDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveLead} disabled={!leadForm.name.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add follow-up */}
      <Dialog open={Boolean(fuDialog)} onClose={() => setFuDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Follow-up with {fuDialog?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="When" type="datetime-local" InputLabelProps={{ shrink: true }} value={fuForm.due_at} onChange={(e) => setFuForm((p) => ({ ...p, due_at: e.target.value }))} />
            <TextField select label="How" value={fuForm.channel} onChange={(e) => setFuForm((p) => ({ ...p, channel: e.target.value }))}>
              {CHANNELS.map((c) => (<MenuItem key={c} value={c}>{c}</MenuItem>))}
            </TextField>
            <TextField label="Note" multiline rows={2} value={fuForm.note} onChange={(e) => setFuForm((p) => ({ ...p, note: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFuDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveFollowUp} disabled={!fuForm.due_at}>Schedule</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
