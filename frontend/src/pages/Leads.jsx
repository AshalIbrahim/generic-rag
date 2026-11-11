/**
 * Leads and follow-ups -- the page an agent keeps open.
 *
 * Changes beyond styling:
 * - A summary strip answers "what do I have to do today?" before the tables.
 * - Follow-up dates read as "Overdue by 2 days" / "Today", not a timestamp.
 * - Completing a follow-up used window.prompt(), a browser dialog that looks
 *   nothing like the app and cannot be cancelled cleanly. It is a proper
 *   dialog now.
 * - The search box debounces instead of refetching on every keystroke.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import CakeOutlined from '@mui/icons-material/CakeOutlined'

import { api } from '../auth'
import { SPACE, palette } from '../theme'
import { EmptyState, Loading, PageHeader, Section, Stat, StatRow, StatusChip } from '../ui'
import { formatDateTime, formatDue, formatPKR, initials } from '../ui/format'

const STATUSES = ['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost']
const CHANNELS = ['call', 'whatsapp', 'sms', 'email', 'meeting']

const emptyLead = { name: '', phone: '', email: '', bday: '', income: '', is_investor: false, notes: '' }

function Avatarish({ name }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        bgcolor: palette.surfaceSunken,
        border: `1px solid ${palette.border}`,
        color: palette.inkSecondary,
        fontSize: 10,
        fontWeight: 620,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </Box>
  )
}

export default function Leads() {
  const [tab, setTab] = useState(0)
  const [leads, setLeads] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [view, setView] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  const [leadDialog, setLeadDialog] = useState(false)
  const [leadForm, setLeadForm] = useState(emptyLead)
  const [saving, setSaving] = useState(false)
  const [fuDialog, setFuDialog] = useState(null)
  const [fuForm, setFuForm] = useState({ due_at: '', channel: 'call', note: '' })
  const [completing, setCompleting] = useState(null)
  const [outcome, setOutcome] = useState('')

  // Typing in the search box used to fire a request per keystroke.
  const debounce = useRef()
  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setQuery(queryInput.trim()), 300)
    return () => clearTimeout(debounce.current)
  }, [queryInput])

  async function load() {
    try {
      setLoading(true)
      setError('')
      const [l, f, b] = await Promise.all([
        api(`/leads${query ? `?q=${encodeURIComponent(query)}` : ''}`),
        api(`/follow-ups?view=${view}`),
        api('/leads/birthdays?days=30'),
      ])
      setLeads(Array.isArray(l) ? l : [])
      setFollowUps(Array.isArray(f) ? f : [])
      setBirthdays(Array.isArray(b) ? b : [])
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
    setSaving(true)
    try {
      await api('/leads', {
        method: 'POST',
        body: {
          name: leadForm.name,
          phone: leadForm.phone || null,
          email: leadForm.email || null,
          notes: leadForm.notes || null,
          bday: leadForm.bday || null,
          income: leadForm.income !== '' ? parseFloat(leadForm.income) : null,
          is_investor: leadForm.is_investor,
        },
      })
      setLeadDialog(false)
      setLeadForm(emptyLead)
      setNotice(`${leadForm.name} added.`)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
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
    setSaving(true)
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
    } finally {
      setSaving(false)
    }
  }

  async function completeFollowUp() {
    setSaving(true)
    try {
      await api(`/follow-ups/${completing.id}/complete`, {
        method: 'PATCH',
        body: { outcome: outcome.trim() || null },
      })
      setCompleting(null)
      setOutcome('')
      setNotice('Marked done.')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const counts = useMemo(() => {
    const overdue = followUps.filter((f) => f.status === 'pending' && f.is_overdue).length
    const pending = followUps.filter((f) => f.status === 'pending').length
    const active = leads.filter((l) => !['won', 'lost'].includes(String(l.status || '').toLowerCase())).length
    const won = leads.filter((l) => String(l.status || '').toLowerCase() === 'won').length
    return { overdue, pending, active, won }
  }, [followUps, leads])

  return (
    <Box>
      <PageHeader
        title="Leads & follow-ups"
        description="Everyone you are talking to, and what you promised to do next."
        actions={
          <Button variant="contained" onClick={() => setLeadDialog(true)}>
            Add lead
          </Button>
        }
      />

      <Box sx={{ mb: `${SPACE.xl}px` }}>
        <StatRow>
          <Stat label="Open leads" value={counts.active} hint={`${leads.length} in total`} />
          <Stat label="Won" value={counts.won} tone={counts.won > 0 ? 'positive' : undefined} />
          <Stat label="Follow-ups due" value={counts.pending} hint="in the current view" />
          <Stat
            label="Overdue"
            value={counts.overdue}
            tone={counts.overdue > 0 ? 'negative' : undefined}
            hint={counts.overdue > 0 ? 'Deal with these first' : 'Nothing late'}
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

      <Section>
        <Box sx={{ px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` } }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label={`Leads (${leads.length})`} />
            <Tab label={`Follow-ups (${followUps.length})`} />
            <Tab label={`Birthdays (${birthdays.length})`} />
          </Tabs>
        </Box>

        {/* ---------------------------------------------------------- leads */}
        {tab === 0 && (
          <>
            <Box
              sx={{
                px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
                py: `${SPACE.lg}px`,
                borderBottom: `1px solid ${palette.border}`,
              }}
            >
              <TextField
                placeholder="Search name, phone or email"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                sx={{ width: { xs: '100%', sm: 322 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined sx={{ fontSize: 17, color: palette.inkMuted }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {loading && <Loading label="Loading leads" />}

            {!loading && leads.length === 0 && (
              <EmptyState
                title={query ? 'No leads match that search' : 'No leads yet'}
                description={
                  query
                    ? 'Try part of a phone number or the first few letters of a name.'
                    : 'Add the people you are talking to, and the team can pick up where you left off.'
                }
                action={
                  !query && (
                    <Button variant="contained" onClick={() => setLeadDialog(true)}>
                      Add lead
                    </Button>
                  )
                }
              />
            )}

            {!loading && leads.length > 0 && (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Lead</TableCell>
                      <TableCell>Contact</TableCell>
                      <TableCell>Profile</TableCell>
                      <TableCell sx={{ width: 150 }}>Status</TableCell>
                      <TableCell>Next follow-up</TableCell>
                      <TableCell>Agent</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {leads.map((l) => (
                      <TableRow key={l.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.md}px` }}>
                            <Avatarish name={l.name} />
                            <Typography sx={{ fontWeight: 550 }}>{l.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {l.phone || l.email ? (
                            <>
                              {l.phone && <Box component="div">{l.phone}</Box>}
                              {l.email && (
                                <Box component="div" sx={{ fontSize: 12 }}>
                                  {l.email}
                                </Box>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.sm}px`, flexWrap: 'wrap' }}>
                            {l.is_investor && <StatusChip status="__investor" label="Investor" />}
                            {l.income ? (
                              <Typography variant="caption" className="tnum" sx={{ color: 'text.secondary' }}>
                                {formatPKR(l.income)}/mo
                              </Typography>
                            ) : null}
                            {!l.is_investor && !l.income && <Typography sx={{ color: 'text.disabled' }}>—</Typography>}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {/* A bare Select reads as a value you can change,
                              where an outlined field looked like a form. */}
                          <Select
                            variant="standard"
                            disableUnderline
                            value={String(l.status || 'new').toLowerCase()}
                            onChange={(e) => changeStatus(l.id, e.target.value)}
                            renderValue={(v) => <StatusChip status={v} />}
                            sx={{ '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
                          >
                            {STATUSES.map((s) => (
                              <MenuItem key={s} value={s}>
                                <StatusChip status={s} />
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell
                          sx={{
                            whiteSpace: 'nowrap',
                            color: l.next_follow_up ? 'text.primary' : 'text.disabled',
                          }}
                        >
                          {l.next_follow_up ? (
                            <>
                              <Box component="div">{formatDue(l.next_follow_up)}</Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {formatDateTime(l.next_follow_up)}
                              </Typography>
                            </>
                          ) : (
                            'Nothing scheduled'
                          )}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{l.agent_name || '—'}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="outlined" onClick={() => setFuDialog(l)}>
                            Schedule
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {/* ----------------------------------------------------- follow-ups */}
        {tab === 1 && (
          <>
            <Box
              sx={{
                px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
                py: `${SPACE.lg}px`,
                borderBottom: `1px solid ${palette.border}`,
              }}
            >
              <TextField select label="Show" value={view} onChange={(e) => setView(e.target.value)} sx={{ width: 207 }}>
                <MenuItem value="pending">All pending</MenuItem>
                <MenuItem value="today">Due today</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="done">Completed</MenuItem>
                <MenuItem value="all">Everything</MenuItem>
              </TextField>
            </Box>

            {loading && <Loading label="Loading follow-ups" />}

            {!loading && followUps.length === 0 && (
              <EmptyState
                title="Nothing here"
                description={
                  view === 'overdue'
                    ? 'Nothing is overdue. That is the way it should look.'
                    : 'No follow-ups in this view. Schedule one from the Leads tab.'
                }
                compact
              />
            )}

            {!loading && followUps.length > 0 && (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Due</TableCell>
                      <TableCell>Lead</TableCell>
                      <TableCell>How</TableCell>
                      <TableCell>Note</TableCell>
                      <TableCell>Agent</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {followUps.map((f) => {
                      const late = f.status === 'pending' && f.is_overdue
                      return (
                        <TableRow key={f.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Box sx={{ color: late ? 'error.main' : 'text.primary', fontWeight: late ? 600 : 400 }}>
                              {formatDue(f.due_at)}
                            </Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {formatDateTime(f.due_at)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontWeight: 550 }}>{f.lead_name}</Typography>
                            {f.lead_phone && (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {f.lead_phone}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                            {f.channel || '—'}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', maxWidth: 288 }}>
                            {f.note || '—'}
                            {f.outcome && (
                              <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                                Outcome: {f.outcome}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{f.agent_name || '—'}</TableCell>
                          <TableCell>
                            <StatusChip status={late ? 'overdue' : f.status} />
                          </TableCell>
                          <TableCell align="right">
                            {f.status === 'pending' && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  setCompleting(f)
                                  setOutcome('')
                                }}
                              >
                                Mark done
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {/* ------------------------------------------------------ birthdays */}
        {tab === 2 && (
          <>
            {loading && <Loading label="Loading birthdays" />}
            {!loading && birthdays.length === 0 && (
              <EmptyState
                title="No birthdays coming up"
                description="Birthdays in the next 30 days appear here, with whoever to call."
                compact
              />
            )}
            {!loading && birthdays.length > 0 && (
              <Box>
                <Box sx={{ px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` }, pt: `${SPACE.lg}px` }}>
                  <Typography variant="body2" color="text.secondary">
                    The next 30 days. A short message on the day goes a long way.
                  </Typography>
                </Box>
                {birthdays.map((b) => (
                  <Box
                    key={b.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${SPACE.lg}px`,
                      px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
                      py: `${SPACE.lg}px`,
                      borderBottom: `1px solid ${palette.border}`,
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Avatarish name={b.name} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.md}px`, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 550 }}>{b.name}</Typography>
                        {b.is_investor && <StatusChip status="__investor" label="Investor" />}
                      </Box>
                      {b.phone && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {b.phone}
                        </Typography>
                      )}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: `${SPACE.sm}px`,
                        color: b.days_until === 0 ? 'success.main' : 'text.secondary',
                        fontWeight: b.days_until === 0 ? 600 : 400,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.days_until === 0 && <CakeOutlined sx={{ fontSize: 16 }} />}
                      {b.days_until === 0 ? 'Today' : b.days_until === 1 ? 'Tomorrow' : `in ${b.days_until} days`}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Section>

      {/* ------------------------------------------------------- dialogs */}
      <Dialog open={leadDialog} onClose={() => setLeadDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add lead</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: `${SPACE.lg}px` }}>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <TextField
                label="Name"
                required
                fullWidth
                autoFocus
                value={leadForm.name}
                onChange={(e) => setLeadForm((p) => ({ ...p, name: e.target.value }))}
              />
            </Box>
            <TextField
              label="Phone"
              fullWidth
              value={leadForm.phone}
              onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <TextField
              label="Email"
              fullWidth
              value={leadForm.email}
              onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))}
            />
            <TextField
              label="Birthday"
              type="date"
              InputLabelProps={{ shrink: true }}
              fullWidth
              value={leadForm.bday}
              onChange={(e) => setLeadForm((p) => ({ ...p, bday: e.target.value }))}
            />
            <TextField
              label="Monthly income (PKR)"
              type="number"
              fullWidth
              value={leadForm.income}
              onChange={(e) => setLeadForm((p) => ({ ...p, income: e.target.value }))}
            />
            <Box sx={{ gridColumn: '1 / -1' }}>
              <TextField
                label="Notes"
                multiline
                rows={2}
                fullWidth
                value={leadForm.notes}
                onChange={(e) => setLeadForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </Box>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={leadForm.is_investor}
                    onChange={(e) => setLeadForm((p) => ({ ...p, is_investor: e.target.checked }))}
                  />
                }
                label={<Typography variant="body2">Buying as an investment</Typography>}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeadDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveLead} disabled={saving || !leadForm.name.trim()}>
            Save lead
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(fuDialog)} onClose={() => setFuDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Follow up with {fuDialog?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.lg}px` }}>
            <TextField
              label="When"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={fuForm.due_at}
              onChange={(e) => setFuForm((p) => ({ ...p, due_at: e.target.value }))}
            />
            <TextField
              select
              label="How"
              value={fuForm.channel}
              onChange={(e) => setFuForm((p) => ({ ...p, channel: e.target.value }))}
            >
              {CHANNELS.map((c) => (
                <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="What is it about?"
              multiline
              rows={2}
              value={fuForm.note}
              onChange={(e) => setFuForm((p) => ({ ...p, note: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFuDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveFollowUp} disabled={saving || !fuForm.due_at}>
            Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(completing)} onClose={() => setCompleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>How did it go?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: `${SPACE.lg}px` }}>
            {completing?.lead_name} · {completing?.channel || 'follow-up'}
          </Typography>
          <TextField
            label="Outcome (optional)"
            multiline
            rows={3}
            fullWidth
            autoFocus
            placeholder="Wants to view on Saturday"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleting(null)}>Cancel</Button>
          <Button variant="contained" onClick={completeFollowUp} disabled={saving}>
            Mark done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
