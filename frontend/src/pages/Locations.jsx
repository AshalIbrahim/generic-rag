/**
 * Locations the agency has stock in.
 *
 * Previously a bare list with purple hover on teal text and a "Clear Filter"
 * button that gave no clue what it would clear. It is now a searchable grid of
 * areas; picking one opens the listings table already filtered to it.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined'

import { API } from '../auth'
import { SPACE, palette } from '../theme'
import { EmptyState, Loading, PageHeader, Section } from '../ui'
import { formatNumber } from '../ui/format'

export default function Locations({ onSelectLocation }) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function fetchLocations() {
      try {
        const resp = await fetch(`${API}/locations`)
        const data = await resp.json()
        if (!cancelled) setLocations(data.locations || [])
      } catch (err) {
        console.error('fetchLocations', err)
        if (!cancelled) setError('Could not load locations.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchLocations()
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return locations
    return locations.filter((l) => String(l).toLowerCase().includes(q))
  }, [locations, query])

  function select(loc) {
    if (onSelectLocation) onSelectLocation(loc)
    navigate('/')
  }

  return (
    <Box>
      <PageHeader
        title="Locations"
        description="The areas your agency has listings in. Pick one to see just those properties."
        actions={
          <Button
            variant="outlined"
            onClick={() => {
              if (onSelectLocation) onSelectLocation(null)
              navigate('/')
            }}
          >
            View all listings
          </Button>
        }
      />

      <Section>
        <Box
          sx={{
            px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` },
            py: `${SPACE.lg}px`,
            borderBottom: `1px solid ${palette.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: `${SPACE.lg}px`,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            placeholder="Search areas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ width: 288 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 17, color: palette.inkMuted }} />
                </InputAdornment>
              ),
            }}
          />
          {!loading && (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
              {formatNumber(shown.length)} {shown.length === 1 ? 'area' : 'areas'}
            </Typography>
          )}
        </Box>

        {loading && <Loading label="Loading locations" />}

        {!loading && error && <EmptyState title="Could not load locations" description={error} />}

        {!loading && !error && shown.length === 0 && (
          <EmptyState
            title="No areas match"
            description={query ? `Nothing matched "${query}".` : 'No locations have been recorded yet.'}
            compact
          />
        )}

        {!loading && !error && shown.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            }}
          >
            {shown.map((loc, i) => (
              <Box
                key={loc}
                component="button"
                type="button"
                onClick={() => select(loc)}
                sx={{
                  appearance: 'none',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  bgcolor: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${palette.border}`,
                  borderRight: { sm: `1px solid ${palette.border}` },
                  px: `${SPACE.xl}px`,
                  py: `${SPACE.lg}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: `${SPACE.md}px`,
                  color: palette.ink,
                  transition: 'background-color .12s ease',
                  '&:hover': { bgcolor: palette.surfaceSunken, color: palette.accent },
                }}
              >
                <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc}
                </Box>
                <ChevronRightOutlined sx={{ fontSize: 16, color: palette.inkMuted, flexShrink: 0 }} />
              </Box>
            ))}
          </Box>
        )}
      </Section>
    </Box>
  )
}
