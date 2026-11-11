/**
 * The filter bar above the listings table.
 *
 * Was a raised panel with a purple-tinted gradient and teal text on it. It is
 * now a plain toolbar that belongs to the results panel below it, so filtering
 * and results read as one thing rather than two competing boxes.
 */
import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { API } from '../auth'
import { SPACE, palette } from '../theme'

const PURPOSES = [
  { value: '', label: 'Sale & rent' },
  { value: 'sale', label: 'For sale' },
  { value: 'rent', label: 'For rent' },
]

export const EMPTY_FILTERS = { type: '', location: '', purpose: '', minPrice: '', maxPrice: '' }

export default function Filters({ filters, setFilters, onApply, locations = [], resultLabel }) {
  const [propertyTypes, setPropertyTypes] = useState([{ value: '', label: 'Any type' }])

  useEffect(() => {
    let cancelled = false
    async function fetchPropertyTypes() {
      try {
        const resp = await fetch(`${API}/prop_type`)
        const data = await resp.json()
        if (cancelled) return
        setPropertyTypes([
          { value: '', label: 'Any type' },
          ...(data.prop_type || []).map((t) => ({ value: t, label: t })),
        ])
      } catch (err) {
        console.error('Failed to fetch property types:', err)
      }
    }
    fetchPropertyTypes()
    return () => {
      cancelled = true
    }
  }, [])

  const activeCount = Object.values(filters).filter((v) => v !== '' && v !== null && v !== undefined).length
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))
  const applyOnEnter = (e) => {
    if (e.key === 'Enter') onApply()
  }

  return (
    <Box sx={{ borderBottom: `1px solid ${palette.border}` }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${SPACE.md}px`,
          px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
          py: `${SPACE.lg}px`,
          // On a phone the fields share the row evenly instead of wrapping into
          // a ragged edge; from sm up they take their natural widths.
          '& > .MuiFormControl-root': { flex: { xs: '1 1 136px', sm: '0 0 auto' } },
        }}
      >
        <TextField
          select
          label="Type"
          value={filters.type || ''}
          onChange={set('type')}
          sx={{ minWidth: 144 }}
        >
          {propertyTypes.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Location"
          value={filters.location || ''}
          onChange={set('location')}
          sx={{ minWidth: 178 }}
        >
          <MenuItem value="">Anywhere</MenuItem>
          {locations.map((loc) => (
            <MenuItem key={loc} value={loc}>
              {loc}
            </MenuItem>
          ))}
        </TextField>

        <TextField select label="Purpose" value={filters.purpose || ''} onChange={set('purpose')} sx={{ minWidth: 144 }}>
          {PURPOSES.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Min price"
          type="number"
          value={filters.minPrice || ''}
          onChange={set('minPrice')}
          onKeyDown={applyOnEnter}
          sx={{ width: 123 }}
        />
        <TextField
          label="Max price"
          type="number"
          value={filters.maxPrice || ''}
          onChange={set('maxPrice')}
          onKeyDown={applyOnEnter}
          sx={{ width: 123 }}
        />

        <Button variant="contained" onClick={onApply}>
          Apply
        </Button>

        {activeCount > 0 && (
          <Button variant="text" onClick={() => { setFilters(EMPTY_FILTERS); }} sx={{ color: 'text.secondary' }}>
            Clear {activeCount > 1 ? `(${activeCount})` : ''}
          </Button>
        )}

        {resultLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', pl: `${SPACE.md}px` }}>
            {resultLabel}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
