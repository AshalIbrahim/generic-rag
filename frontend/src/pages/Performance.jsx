/**
 * Per-agent performance.
 *
 * Same data as before, but the eleven columns are now grouped under headings so
 * it is clear which numbers belong together, and a totals row sits at the
 * bottom -- an owner's first question is almost always "and across everyone?".
 */
import React, { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
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
import { EmptyState, Loading, PageHeader, Section, StatusChip } from '../ui'
import { formatNumber, formatPKR } from '../ui/format'

const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)

export default function Performance() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState({ date_from: '', date_to: '' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError('')
        const q = new URLSearchParams()
        if (range.date_from) q.set('date_from', range.date_from)
        if (range.date_to) q.set('date_to', range.date_to)
        const data = await api(`/agents/performance${q.toString() ? `?${q}` : ''}`)
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [range])

  const totals = useMemo(
    () => ({
      listings: sum(rows, 'listings'),
      leads_assigned: sum(rows, 'leads_assigned'),
      leads_won: sum(rows, 'leads_won'),
      follow_ups_done: sum(rows, 'follow_ups_done'),
      follow_ups_pending: sum(rows, 'follow_ups_pending'),
      follow_ups_overdue: sum(rows, 'follow_ups_overdue'),
      deals_closed: sum(rows, 'deals_closed'),
      sales_volume: sum(rows, 'sales_volume'),
      agent_commission: sum(rows, 'agent_commission'),
    }),
    [rows]
  )

  const groupHead = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: palette.inkMuted,
    borderBottom: `1px solid ${palette.border}`,
    bgcolor: palette.surfaceSunken,
    py: `${SPACE.sm}px`,
  }

  return (
    <Box>
      <PageHeader
        title="Team performance"
        description="How each agent is doing: what they have listed, how their leads are moving, and what they have closed."
      />

      <Section>
        <Box
          sx={{
            display: 'flex',
            gap: `${SPACE.md}px`,
            flexWrap: 'wrap',
            alignItems: 'center',
            px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
            py: `${SPACE.lg}px`,
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <TextField
            type="date"
            label="Deals from"
            InputLabelProps={{ shrink: true }}
            value={range.date_from}
            onChange={(e) => setRange((p) => ({ ...p, date_from: e.target.value }))}
          />
          <TextField
            type="date"
            label="Deals to"
            InputLabelProps={{ shrink: true }}
            value={range.date_to}
            onChange={(e) => setRange((p) => ({ ...p, date_to: e.target.value }))}
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {range.date_from || range.date_to
              ? 'Deal figures use the date range; listings and leads are all-time.'
              : 'All time'}
          </Typography>
        </Box>

        {error && (
          <Box sx={{ p: `${SPACE.xl}px` }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {!error && loading && <Loading label="Loading performance" />}

        {!error && !loading && rows.length === 0 && (
          <EmptyState
            title="Nothing to show yet"
            description="Once your team has listings and leads, their numbers appear here."
          />
        )}

        {!error && !loading && rows.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                {/* Grouping row: eleven bare columns were hard to read. */}
                <TableRow>
                  <TableCell sx={{ ...groupHead, bgcolor: palette.surfaceSunken }} />
                  <TableCell align="center" sx={groupHead}>
                    Stock
                  </TableCell>
                  <TableCell align="center" colSpan={3} sx={groupHead}>
                    Leads
                  </TableCell>
                  <TableCell align="center" colSpan={3} sx={groupHead}>
                    Follow-ups
                  </TableCell>
                  <TableCell align="center" colSpan={3} sx={groupHead}>
                    Closed business
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Listings</TableCell>
                  <TableCell align="right">Assigned</TableCell>
                  <TableCell align="right">Won</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right">Done</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Overdue</TableCell>
                  <TableCell align="right">Deals</TableCell>
                  <TableCell align="right">Volume</TableCell>
                  <TableCell align="right">Commission</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.agent_id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.md}px` }}>
                        <Typography sx={{ fontWeight: 550 }}>{r.name || r.email}</Typography>
                        <StatusChip status="__role" label={r.role} />
                      </Box>
                      {r.name && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {r.email}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.listings)}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.leads_assigned)}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.leads_won)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ color: 'text.secondary' }}>
                      {r.conversion_rate_pct}%
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.follow_ups_done)}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.follow_ups_pending)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tnum"
                      sx={{
                        color: r.follow_ups_overdue > 0 ? 'error.main' : 'text.secondary',
                        fontWeight: r.follow_ups_overdue > 0 ? 650 : 400,
                      }}
                    >
                      {formatNumber(r.follow_ups_overdue)}
                    </TableCell>
                    <TableCell align="right" className="tnum">
                      {formatNumber(r.deals_closed)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ whiteSpace: 'nowrap' }}>
                      {formatPKR(r.sales_volume)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatPKR(r.agent_commission)}
                    </TableCell>
                  </TableRow>
                ))}

                {rows.length > 1 && (
                  <TableRow sx={{ bgcolor: palette.surfaceSunken }}>
                    <TableCell sx={{ fontWeight: 650 }}>Everyone</TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.listings)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.leads_assigned)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.leads_won)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ color: 'text.secondary' }}>
                      {totals.leads_assigned
                        ? `${Math.round((totals.leads_won / totals.leads_assigned) * 100)}%`
                        : '—'}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.follow_ups_done)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.follow_ups_pending)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tnum"
                      sx={{ fontWeight: 650, color: totals.follow_ups_overdue > 0 ? 'error.main' : 'inherit' }}
                    >
                      {formatNumber(totals.follow_ups_overdue)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650 }}>
                      {formatNumber(totals.deals_closed)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
                      {formatPKR(totals.sales_volume)}
                    </TableCell>
                    <TableCell align="right" className="tnum" sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
                      {formatPKR(totals.agent_commission)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>
    </Box>
  )
}
