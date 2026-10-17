import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
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

export default function Performance() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState({ date_from: '', date_to: '' })

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const q = new URLSearchParams()
        if (range.date_from) q.set('date_from', range.date_from)
        if (range.date_to) q.set('date_to', range.date_to)
        setRows(await api(`/agents/performance${q.toString() ? `?${q}` : ''}`))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [range])

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Team Performance</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField type="date" size="small" label="Deals from" InputLabelProps={{ shrink: true }}
          value={range.date_from} onChange={(e) => setRange((p) => ({ ...p, date_from: e.target.value }))} />
        <TextField type="date" size="small" label="Deals to" InputLabelProps={{ shrink: true }}
          value={range.date_to} onChange={(e) => setRange((p) => ({ ...p, date_to: e.target.value }))} />
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ borderRadius: 3 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Listings</TableCell>
                  <TableCell align="right">Leads</TableCell>
                  <TableCell align="right">Won</TableCell>
                  <TableCell align="right">Conversion</TableCell>
                  <TableCell align="right">Follow-ups done</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Overdue</TableCell>
                  <TableCell align="right">Deals</TableCell>
                  <TableCell align="right">Sales volume</TableCell>
                  <TableCell align="right">Commission</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={11}><Typography color="text.secondary">No agents to show.</Typography></TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.agent_id}>
                    <TableCell>{r.name || r.email} <Chip size="small" label={r.role} sx={{ ml: 0.5 }} /></TableCell>
                    <TableCell align="right">{r.listings}</TableCell>
                    <TableCell align="right">{r.leads_assigned}</TableCell>
                    <TableCell align="right">{r.leads_won}</TableCell>
                    <TableCell align="right">{r.conversion_rate_pct}%</TableCell>
                    <TableCell align="right">{r.follow_ups_done}</TableCell>
                    <TableCell align="right">{r.follow_ups_pending}</TableCell>
                    <TableCell align="right" sx={{ color: r.follow_ups_overdue > 0 ? 'error.main' : 'inherit', fontWeight: r.follow_ups_overdue > 0 ? 700 : 400 }}>
                      {r.follow_ups_overdue}
                    </TableCell>
                    <TableCell align="right">{r.deals_closed}</TableCell>
                    <TableCell align="right">{formatPKR(r.sales_volume)}</TableCell>
                    <TableCell align="right">{formatPKR(r.agent_commission)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  )
}
