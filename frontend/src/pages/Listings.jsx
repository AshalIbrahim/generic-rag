/**
 * The listings table.
 *
 * Was a grid of gradient cards that lifted and scaled on hover. For an agent
 * comparing twenty properties, a card grid is the wrong shape: it fits four or
 * five on screen, and prices end up at different heights so they cannot be
 * scanned down a column. This is a table, with prices right-aligned in tabular
 * figures and a small thumbnail kept in the first column, since a property
 * without a photo is hard to recognise.
 *
 * Narrow screens get the same rows stacked, not cards.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Pagination from '@mui/material/Pagination'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ImageOutlined from '@mui/icons-material/ImageOutlined'

import Filters, { EMPTY_FILTERS } from '../components/Filters'
import { API, authHeaders } from '../auth'
import { SPACE, RATIO, palette } from '../theme'
import { EmptyState, Loading, PageHeader, Section, StatusChip } from '../ui'
import { formatArea, formatNumber, formatPKR, formatPKRCompact, pricePerArea, purposeLabel } from '../ui/format'

const PAGE_SIZE = 20

/** Small 1.618:1 thumbnail, or a neutral placeholder when there is no photo. */
function Thumb({ src, alt }) {
  return (
    <Box
      sx={{
        width: 55,
        aspectRatio: RATIO.golden,
        borderRadius: '6px',
        overflow: 'hidden',
        bgcolor: palette.surfaceSunken,
        border: `1px solid ${palette.border}`,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {src ? (
        <Box component="img" src={src} alt={alt} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <ImageOutlined sx={{ fontSize: 15, color: palette.inkMuted }} />
      )}
    </Box>
  )
}

const rowLink = {
  color: 'inherit',
  textDecoration: 'none',
  '&:hover .listing-title': { color: palette.accent, textDecoration: 'underline' },
}

export default function Listings({ filterLocation }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const isCompact = useMediaQuery(theme.breakpoints.down('md'))

  const [listings, setListings] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [locations, setLocations] = useState([])
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  // What the last request actually searched for. Kept apart from `filters` so
  // editing a field does not change the results until Apply is pressed.
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // A location picked on the Locations page arrives as a prop.
  useEffect(() => {
    if (filterLocation) {
      const next = { ...EMPTY_FILTERS, location: filterLocation }
      setFilters(next)
      setApplied(next)
      setPage(1)
    }
  }, [filterLocation])

  useEffect(() => {
    let cancelled = false
    async function fetchLocations() {
      try {
        const resp = await fetch(`${API}/locations`)
        const data = await resp.json()
        if (!cancelled) setLocations(data.locations || [])
      } catch (err) {
        console.error('fetchLocations', err)
      }
    }
    fetchLocations()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchListings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = new URL(`${API}/listings`)
      url.searchParams.set('limit', PAGE_SIZE)
      url.searchParams.set('offset', (page - 1) * PAGE_SIZE)
      if (applied.location) url.searchParams.set('location', applied.location)
      if (applied.type) url.searchParams.set('prop_type', applied.type)
      if (applied.purpose) url.searchParams.set('purpose', applied.purpose)
      if (applied.minPrice) url.searchParams.set('min_price', applied.minPrice)
      if (applied.maxPrice) url.searchParams.set('max_price', applied.maxPrice)

      const resp = await fetch(url.toString(), { headers: authHeaders() })
      const data = await resp.json()
      if (!resp.ok) {
        setListings([])
        setTotal(0)
        setError(typeof data?.detail === 'string' ? data.detail : 'Could not load listings.')
        return
      }
      setListings(Array.isArray(data) ? data : [])
      setTotal(parseInt(resp.headers.get('X-Total-Count') || '0', 10))
    } catch (err) {
      console.error('fetchListings', err)
      setListings([])
      setTotal(0)
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [applied, page])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  function handleApply() {
    setApplied({ ...filters })
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)
  const resultLabel = error
    ? '' // the panel below already explains what went wrong
    : loading
      ? 'Searching…'
      : total === 0
        ? 'No matches'
        : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}`

  const hasFilters = Object.values(applied).some(Boolean)

  return (
    <Box>
      <PageHeader
        title="Listings"
        description="Every property on your agency's books. Filter, then open one to see photos, amenities and what people say about the area."
        actions={
          <Button component={RouterLink} to="/add-listing" variant="contained">
            Add a listing
          </Button>
        }
      />

      <Section>
        <Filters
          filters={filters}
          setFilters={setFilters}
          onApply={handleApply}
          locations={locations}
          resultLabel={resultLabel}
        />

        {error && (
          <EmptyState title="Could not load listings" description={error} action={<Button variant="outlined" onClick={fetchListings}>Try again</Button>} />
        )}

        {!error && loading && <Loading label="Loading listings" />}

        {!error && !loading && listings.length === 0 && (
          <EmptyState
            title={hasFilters ? 'Nothing matches those filters' : 'No listings yet'}
            description={
              hasFilters
                ? 'Try widening the price range, or clearing a filter to see more.'
                : 'Once you add a property it will show up here for the whole team.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setFilters({ ...EMPTY_FILTERS })
                    setApplied({ ...EMPTY_FILTERS })
                    setPage(1)
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button component={RouterLink} to="/add-listing" variant="contained">
                  Add a listing
                </Button>
              )
            }
          />
        )}

        {!error && !loading && listings.length > 0 && (isCompact ? (
          /* Stacked rows for narrow screens -- the same information, not cards. */
          <Box>
            {listings.map((l) => {
              const ppa = pricePerArea(l.price, l.covered_area)
              return (
                <Box
                  key={l.id}
                  component={RouterLink}
                  to={`/property/${l.id}`}
                  sx={{
                    ...rowLink,
                    display: 'flex',
                    gap: `${SPACE.lg}px`,
                    px: `${SPACE.lg}px`,
                    py: `${SPACE.lg}px`,
                    borderBottom: `1px solid ${palette.border}`,
                    '&:last-of-type': { borderBottom: 'none' },
                  }}
                >
                  <Thumb src={l.thumbnail_url} alt={l.prop_type || 'Property'} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: `${SPACE.md}px`, flexWrap: 'wrap' }}>
                      <Typography className="listing-title" sx={{ fontWeight: 600 }}>
                        {l.prop_type || 'Property'}
                      </Typography>
                      <StatusChip status={purposeLabel(l.purpose)} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.xxs}px` }}>
                      {l.location || 'Location not recorded'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.xxs}px` }}>
                      {l.beds ?? '—'} beds · {l.baths ?? '—'} baths · area {formatArea(l.covered_area)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography className="tnum" sx={{ fontWeight: 620 }}>
                      {formatPKRCompact(l.price)}
                    </Typography>
                    {ppa && (
                      <Typography variant="caption" className="tnum" sx={{ color: 'text.secondary' }}>
                        {Math.round(ppa).toLocaleString()}/unit
                      </Typography>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 76 }} />
                  <TableCell>Property</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="center">Beds</TableCell>
                  <TableCell align="center">Baths</TableCell>
                  <TableCell align="right">Area</TableCell>
                  <TableCell align="right">Per unit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listings.map((l) => {
                  const ppa = pricePerArea(l.price, l.covered_area)
                  return (
                    // The whole row is clickable for speed, but the title is a
                    // real link as well, so it can be opened in a new tab and
                    // reached with the keyboard.
                    <TableRow
                      key={l.id}
                      hover
                      onClick={() => navigate(`/property/${l.id}`)}
                      sx={{ cursor: 'pointer', '&:hover .listing-title': { color: palette.accent } }}
                    >
                      <TableCell>
                        <Thumb src={l.thumbnail_url} alt={l.prop_type || 'Property'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.md}px` }}>
                          <Box
                            component={RouterLink}
                            to={`/property/${l.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="listing-title"
                            sx={{ fontWeight: 550, color: 'inherit', textDecoration: 'none' }}
                          >
                            {l.prop_type || 'Property'}
                          </Box>
                          <StatusChip status={purposeLabel(l.purpose)} />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          #{l.id}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{l.location || '—'}</TableCell>
                      <TableCell align="right" className="tnum" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatPKR(l.price)}
                      </TableCell>
                      <TableCell align="center" className="tnum">
                        {l.beds ?? '—'}
                      </TableCell>
                      <TableCell align="center" className="tnum">
                        {l.baths ?? '—'}
                      </TableCell>
                      <TableCell align="right" className="tnum">
                        {formatArea(l.covered_area)}
                      </TableCell>
                      <TableCell align="right" className="tnum" sx={{ color: 'text.secondary' }}>
                        {ppa ? Math.round(ppa).toLocaleString() : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}

        {!error && totalPages > 1 && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              px: `${SPACE.xl}px`,
              py: `${SPACE.lg}px`,
              borderTop: `1px solid ${palette.border}`,
            }}
          >
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, value) => {
                setPage(value)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              color="primary"
              shape="rounded"
              siblingCount={1}
            />
          </Box>
        )}
      </Section>
    </Box>
  )
}
