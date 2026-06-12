import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const purposes = [
  { value: '', label: 'Sale & Rent' },
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
]

export default function Filters({ filters, setFilters, onApply, locations = [] }) {
  const [propertyTypes, setPropertyTypes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPropertyTypes() {
      try {
        const resp = await fetch(`${API}/prop_type`)
        const data = await resp.json()
        const types = data.prop_type || []
        setPropertyTypes([
          { value: '', label: 'Any type' },
          ...types.map(t => ({ value: t, label: t }))
        ])
      } catch (err) {
        console.error('Failed to fetch property types:', err)
        // Fallback to empty array
        setPropertyTypes([{ value: '', label: 'Any type' }])
      } finally {
        setLoading(false)
      }
    }
    fetchPropertyTypes()
  }, [])
  return (
    <Paper 
      elevation={3} 
      sx={{ 
        mb: 3, 
        p: 2.5, 
        borderRadius: 3,
        background: 'linear-gradient(135deg, rgba(123,31,162,0.06), rgba(156,39,176,0.03), #ffffff)',
        border: '1px solid rgba(123,31,162,0.1)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f766e' }}>
          Refine results
        </Typography>
        <Button
          size="small"
          onClick={() => setFilters({ type: '', location: '', purpose: '', minPrice: '', maxPrice: '' })}
          sx={{
            color: '#14b8a6',
            '&:hover': {
              background: 'rgba(123,31,162,0.1)',
            },
          }}
        >
          Clear all
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          label="Type"
          size="small"
          value={filters.type || ''}
          onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          sx={{ minWidth: 150 }}
          disabled={loading}
          helperText={loading ? 'Loading...' : ''}
        >
          {propertyTypes.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          select={Boolean(locations && locations.length)}
          label="Location"
          size="small"
          value={filters.location || ''}
          onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
          sx={{ minWidth: 180 }}
        >
          {(locations && locations.length ? locations : []).map(loc => (
            <MenuItem key={loc} value={loc}>{loc}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Purpose"
          size="small"
          value={filters.purpose || ''}
          onChange={e => setFilters(f => ({ ...f, purpose: e.target.value }))}
          sx={{ minWidth: 150 }}
        >
          {purposes.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          label="Min Price"
          size="small"
          type="number"
          value={filters.minPrice || ''}
          onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))}
          sx={{ minWidth: 120 }}
        />
        <TextField
          label="Max Price"
          size="small"
          type="number"
          value={filters.maxPrice || ''}
          onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
          sx={{ minWidth: 120 }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button 
            variant="contained" 
            onClick={onApply} 
            sx={{ 
              minWidth: 120,
              background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
              '&:hover': {
                background: 'linear-gradient(90deg, #0b5d56, #0f766e)',
              },
            }}
          >
            Apply filters
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}

