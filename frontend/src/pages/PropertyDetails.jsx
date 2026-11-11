/**
 * One property.
 *
 * Was a single card of "Label: value" lines with a 140px image strip below.
 * Now the photo leads (it is what an agent shows a buyer), the price and key
 * facts sit in a panel beside it, and the area notes are presented as
 * reported opinion rather than fact, because that is what they are.
 *
 * Layout is the 61.8 / 38.2 split: gallery and description major, facts minor.
 */
import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'

import { API, authHeaders } from '../auth'
import { RATIO, SPACE, palette } from '../theme'
import { EmptyState, FieldRow, Loading, PageHeader, Section, StatusChip } from '../ui'
import { formatArea, formatPKR, formatPKRCompact, pricePerArea, purposeLabel } from '../ui/format'

const AREA_NOTES = [
  ['water_sentiment', 'Water'],
  ['electricity_sentiment', 'Electricity'],
  ['gas_sentiment', 'Gas'],
  ['traffic_sentiment', 'Traffic'],
  ['safety_sentiment', 'Safety'],
]

/** Colour a reported note only when its wording is clearly good or bad. */
function noteTone(value) {
  const v = String(value || '').toLowerCase()
  if (/good|excellent|great|high|safe|positive/.test(v)) return 'success.main'
  if (/bad|poor|low|unsafe|negative|issue/.test(v)) return 'error.main'
  return 'text.primary'
}

export default function PropertyDetails() {
  const { id } = useParams()
  const [property, setProperty] = useState(null)
  const [perm, setPerm] = useState({ can_edit: false, listed_by: null, is_mine: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [newImages, setNewImages] = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [imageError, setImageError] = useState('')
  const [deletingImageId, setDeletingImageId] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    fetchProperty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function fetchProperty() {
    try {
      setLoading(true)
      setError('')
      const resp = await fetch(`${API}/listings/${id}`, { headers: authHeaders() })
      if (!resp.ok) throw new Error('Property not found')
      const data = await resp.json()
      setProperty(data)
      setActiveImage(0)
      try {
        const pr = await fetch(`${API}/listings/${id}/permissions`, { headers: authHeaders() })
        setPerm(pr.ok ? await pr.json() : { can_edit: false, listed_by: null, is_mine: false })
      } catch {
        setPerm({ can_edit: false, listed_by: null, is_mine: false })
      }
    } catch (e) {
      setError(e.message || 'Failed to load property')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => {
    setEditForm({
      prop_type: property.prop_type === 'N/A' ? '' : property.prop_type,
      purpose: property.purpose === 'N/A' ? '' : property.purpose,
      covered_area: property.covered_area ?? '',
      price: property.price ?? '',
      location: property.location === 'N/A' ? '' : property.location,
      beds: property.beds ?? '',
      baths: property.baths ?? '',
      amenities: property.amenities === 'N/A' ? '' : property.amenities,
    })
    setSaveError('')
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditForm(null)
    setSaveError('')
  }

  const handleEditChange = (e) => {
    const { name, value } = e.target
    setEditForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSaveEdit() {
    setSaving(true)
    setSaveError('')
    try {
      const resp = await fetch(`${API}/listings/${id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prop_type: editForm.prop_type,
          purpose: editForm.purpose,
          covered_area: parseFloat(editForm.covered_area),
          price: parseFloat(editForm.price),
          location: editForm.location,
          beds: parseInt(editForm.beds, 10),
          baths: parseInt(editForm.baths, 10),
          amenities: editForm.amenities || '',
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to save changes')
      }
      await fetchProperty()
      setEditMode(false)
      setEditForm(null)
    } catch (e) {
      setSaveError(e.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadImages() {
    if (newImages.length === 0) return
    setUploadingImages(true)
    setImageError('')
    const payload = new FormData()
    newImages.forEach((file) => payload.append('files', file))
    try {
      const resp = await fetch(`${API}/listings/${id}/images`, {
        method: 'POST',
        headers: authHeaders(),
        body: payload,
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to upload images')
      }
      const data = await resp.json()
      if (data.failed && data.failed.length > 0) {
        setImageError(`${data.failed.length} image(s) failed to upload.`)
      }
      setNewImages([])
      await fetchProperty()
    } catch (e) {
      setImageError(e.message || 'Failed to upload images')
    } finally {
      setUploadingImages(false)
    }
  }

  async function handleDeleteImage(imageId) {
    setDeletingImageId(imageId)
    setImageError('')
    try {
      const resp = await fetch(`${API}/listings/${id}/images/${imageId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to delete image')
      }
      setActiveImage(0)
      await fetchProperty()
    } catch (e) {
      setImageError(e.message || 'Failed to delete image')
    } finally {
      setDeletingImageId(null)
    }
  }

  if (loading) return <Loading label="Loading property" />

  if (error || !property) {
    return (
      <Box>
        <Button component={RouterLink} to="/" startIcon={<ArrowBackOutlined sx={{ fontSize: 16 }} />} sx={{ mb: `${SPACE.lg}px` }}>
          Back to listings
        </Button>
        <Section>
          <EmptyState title="Property not found" description={error || 'It may have been removed.'} />
        </Section>
      </Box>
    )
  }

  const images = property.images || []
  const hero = images[activeImage] || images[0]
  const ppa = pricePerArea(property.price, property.covered_area)
  const notes = AREA_NOTES.filter(([key]) => property[key])

  return (
    <Box>
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackOutlined sx={{ fontSize: 16 }} />}
        sx={{ mb: `${SPACE.lg}px`, ml: `-${SPACE.md}px`, color: 'text.secondary' }}
      >
        Back to listings
      </Button>

      <PageHeader
        title={`${property.prop_type || 'Property'}${property.location ? ` in ${property.location}` : ''}`}
        description={`Listing #${property.id}`}
        actions={
          !editMode &&
          perm.can_edit && (
            <Button variant="outlined" onClick={startEdit}>
              Edit details
            </Button>
          )
        }
      >
        <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, alignItems: 'center', flexWrap: 'wrap', mt: `${SPACE.lg}px` }}>
          <StatusChip status={purposeLabel(property.purpose)} />
          <StatusChip
            status={perm.is_mine ? 'won' : '__neutral'}
            label={
              perm.listed_by
                ? perm.is_mine
                  ? 'Listed by you'
                  : `Listed by ${perm.listed_by.name || perm.listed_by.email}`
                : 'No agent assigned'
            }
          />
          {!perm.can_edit && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              View only — the agent who listed this can edit it.
            </Typography>
          )}
        </Box>
      </PageHeader>

      {saveError && (
        <Alert severity="error" sx={{ mb: `${SPACE.lg}px` }} onClose={() => setSaveError('')}>
          {saveError}
        </Alert>
      )}

      {editMode ? (
        <Section title="Edit details" padded>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: `${SPACE.lg}px` }}>
            <TextField label="Property type" name="prop_type" value={editForm.prop_type} onChange={handleEditChange} fullWidth />
            <TextField label="Purpose" name="purpose" value={editForm.purpose} onChange={handleEditChange} fullWidth helperText="For Sale or For Rent" />
            <TextField label="Location" name="location" value={editForm.location} onChange={handleEditChange} fullWidth />
            <TextField label="Price (PKR)" name="price" type="number" value={editForm.price} onChange={handleEditChange} fullWidth />
            <TextField label="Covered area" name="covered_area" type="number" value={editForm.covered_area} onChange={handleEditChange} fullWidth />
            <TextField label="Beds" name="beds" type="number" value={editForm.beds} onChange={handleEditChange} fullWidth />
            <TextField label="Baths" name="baths" type="number" value={editForm.baths} onChange={handleEditChange} fullWidth />
            <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
              <TextField
                label="Amenities"
                name="amenities"
                value={editForm.amenities}
                onChange={handleEditChange}
                fullWidth
                multiline
                rows={3}
                helperText="Separate with commas"
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, justifyContent: 'flex-end', mt: `${SPACE.xl}px` }}>
            <Button variant="outlined" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </Box>
        </Section>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '61.8fr 38.2fr' }, gap: `${SPACE.xl}px`, alignItems: 'start' }}>
          {/* ------------------------------------------------ major column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.xl}px`, minWidth: 0 }}>
            <Section>
              <Box
                sx={{
                  aspectRatio: RATIO.golden,
                  bgcolor: palette.surfaceSunken,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: hero ? 'zoom-in' : 'default',
                  overflow: 'hidden',
                }}
                onClick={() => hero && setLightboxUrl(hero.url)}
              >
                {hero ? (
                  <Box component="img" src={hero.url} alt={`${property.prop_type || 'Property'} ${property.id}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Box sx={{ textAlign: 'center', color: palette.inkMuted }}>
                    <ImageOutlined sx={{ fontSize: 26 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: `${SPACE.sm}px` }}>
                      No photos yet
                    </Typography>
                  </Box>
                )}
              </Box>

              {images.length > 0 && (
                <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, p: `${SPACE.lg}px`, overflowX: 'auto', borderTop: `1px solid ${palette.border}` }}>
                  {images.map((img, i) => (
                    <Box key={img.id} sx={{ position: 'relative', flexShrink: 0 }}>
                      <Box
                        component="img"
                        src={img.url}
                        alt=""
                        onClick={() => setActiveImage(i)}
                        sx={{
                          width: 89, // Fibonacci
                          aspectRatio: RATIO.golden,
                          objectFit: 'cover',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'block',
                          border: `2px solid ${i === activeImage ? palette.accent : 'transparent'}`,
                        }}
                      />
                      {perm.can_edit && (
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteImage(img.id)}
                          disabled={deletingImageId === img.id}
                          aria-label="Delete image"
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: 18,
                            height: 18,
                            bgcolor: 'rgba(28,25,23,0.65)',
                            color: '#fff',
                            '&:hover': { bgcolor: 'rgba(28,25,23,0.85)' },
                          }}
                        >
                          {deletingImageId === img.id ? (
                            <CircularProgress size={10} color="inherit" />
                          ) : (
                            <CloseOutlined sx={{ fontSize: 11 }} />
                          )}
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              {perm.can_edit && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${SPACE.md}px`,
                    flexWrap: 'wrap',
                    p: `${SPACE.lg}px`,
                    borderTop: `1px solid ${palette.border}`,
                  }}
                >
                  <Button variant="outlined" size="small" component="label">
                    {newImages.length > 0 ? `${newImages.length} selected` : 'Choose photos'}
                    <input
                      type="file"
                      hidden
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        setNewImages(Array.from(e.target.files || []))
                        setImageError('')
                      }}
                    />
                  </Button>
                  <Button variant="contained" size="small" onClick={handleUploadImages} disabled={newImages.length === 0 || uploadingImages}>
                    {uploadingImages ? 'Uploading…' : 'Upload'}
                  </Button>
                  {imageError && (
                    <Typography variant="caption" sx={{ color: 'error.main' }}>
                      {imageError}
                    </Typography>
                  )}
                </Box>
              )}
            </Section>

            {property.amenities && property.amenities !== 'N/A' && (
              <Section title="Amenities" padded>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: `${SPACE.md}px` }}>
                  {String(property.amenities)
                    .split(/[,;|]/)
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .map((a, i) => (
                      <Box
                        key={`${a}-${i}`}
                        sx={{
                          px: `${SPACE.lg}px`,
                          py: `${SPACE.sm}px`,
                          border: `1px solid ${palette.border}`,
                          borderRadius: '6px',
                          fontSize: 12.5,
                          color: palette.inkSecondary,
                          bgcolor: palette.surfaceSunken,
                        }}
                      >
                        {a}
                      </Box>
                    ))}
                </Box>
              </Section>
            )}
          </Box>

          {/* ------------------------------------------------ minor column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.xl}px`, minWidth: 0 }}>
            <Section padded>
              <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block' }}>
                {purposeLabel(property.purpose) === 'For Rent' ? 'Monthly rent' : 'Asking price'}
              </Typography>
              <Typography className="tnum" sx={{ fontSize: 23, fontWeight: 650, letterSpacing: '-0.02em', mt: `${SPACE.xs}px` }}>
                {formatPKR(property.price)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: `${SPACE.lg}px` }}>
                {formatPKRCompact(property.price)}
                {ppa ? ` · ${Math.round(ppa).toLocaleString()} per unit of area` : ''}
              </Typography>

              <FieldRow label="Type" value={property.prop_type || '—'} />
              <FieldRow label="Location" value={property.location || '—'} />
              <FieldRow label="Beds" value={property.beds ?? '—'} />
              <FieldRow label="Baths" value={property.baths ?? '—'} />
              <FieldRow label="Covered area" value={formatArea(property.covered_area)} />
            </Section>

            {notes.length > 0 && (
              <Section
                title="Area notes"
                description="What residents have reported about this area. Treat it as opinion, not fact."
                padded
              >
                {notes.map(([key, label]) => (
                  <FieldRow
                    key={key}
                    label={label}
                    value={
                      <Box component="span" sx={{ color: noteTone(property[key]), textTransform: 'capitalize' }}>
                        {property[key]}
                      </Box>
                    }
                  />
                ))}
              </Section>
            )}
          </Box>
        </Box>
      )}

      <Dialog open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} maxWidth="lg">
        {lightboxUrl && (
          <Box
            component="img"
            src={lightboxUrl}
            alt="Property"
            onClick={() => setLightboxUrl(null)}
            sx={{ width: '100%', maxHeight: '85vh', objectFit: 'contain', display: 'block', cursor: 'zoom-out' }}
          />
        )}
      </Dialog>
    </Box>
  )
}
