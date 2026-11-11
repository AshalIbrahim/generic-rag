/**
 * Add a listing, one at a time or from a spreadsheet.
 *
 * Changes beyond styling:
 * - Location and property type are combo boxes you can type into. They were
 *   dropdowns limited to values already in the database, so there was no way
 *   to list a property in a new area -- even though the server creates the
 *   location when it sees an unfamiliar name (get_or_create_location).
 * - "Covered Area (sqft)" lost its unit. The column stores a bare number with
 *   no unit recorded, so labelling it sqft was a guess shown to the user.
 * - The CSV example is a Pakistani address and a PKR price, not "Austin, Texas".
 * - Success no longer bounces you to the listings page after two seconds; you
 *   choose whether to add another or go and look at it.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import axios from 'axios'

import { API, authHeaders } from '../auth'
import { SPACE, palette } from '../theme'
import { PageHeader, Section } from '../ui'

const emptyForm = {
  prop_type: '',
  purpose: 'sale',
  covered_area: '',
  price: '',
  location: '',
  beds: '',
  baths: '',
  amenities: '',
}

const CSV_COLUMNS = ['prop_type', 'purpose', 'covered_area', 'price', 'location', 'beds', 'baths', 'amenities']
const CSV_EXAMPLE = ['House', 'For Sale', '2200', '45000000', 'DHA Phase 5, Lahore', '4', '3', 'Garage, Backup generator']

export default function AddListing() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(emptyForm)
  const [locations, setLocations] = useState([])
  const [propertyTypes, setPropertyTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const [error, setError] = useState('')

  const [mode, setMode] = useState(0) // 0 = single, 1 = bulk
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkError, setBulkError] = useState('')

  const [singleImages, setSingleImages] = useState([])

  useEffect(() => {
    async function fetchOptions() {
      try {
        const [locResp, typeResp] = await Promise.all([
          axios.get(`${API}/locations`),
          axios.get(`${API}/prop_type`),
        ])
        setLocations(locResp.data.locations || [])
        setPropertyTypes(typeResp.data.prop_type || [])
      } catch (err) {
        console.error('Error fetching options:', err)
      }
    }
    fetchOptions()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setCreatedId(null)

    try {
      const response = await axios.post(
        `${API}/listings/add`,
        {
          prop_type: formData.prop_type,
          purpose: formData.purpose,
          covered_area: parseFloat(formData.covered_area),
          price: parseFloat(formData.price),
          location: formData.location,
          beds: parseInt(formData.beds, 10),
          baths: parseInt(formData.baths, 10),
          amenities: formData.amenities || '',
        },
        { headers: authHeaders() }
      )

      if (response.data.success) {
        const newId = response.data.id
        if (newId && singleImages.length > 0) {
          const imagePayload = new FormData()
          singleImages.forEach((img) => imagePayload.append('files', img))
          try {
            await axios.post(`${API}/listings/${newId}/images`, imagePayload, {
              headers: authHeaders({ 'Content-Type': 'multipart/form-data' }),
            })
          } catch (imgErr) {
            console.error('Image upload failed:', imgErr)
            setError('The listing was saved, but the photos did not upload. You can add them from the listing page.')
          }
        }
        setCreatedId(newId)
        setFormData(emptyForm)
        setSingleImages([])
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not add the listing. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleDownloadTemplate() {
    const csvContent = `${CSV_COLUMNS.join(',')}\n${CSV_EXAMPLE.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')}\n`
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'listings_template.csv'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  async function handleBulkUpload(e) {
    e.preventDefault()
    if (!bulkFile) {
      setBulkError('Choose a .csv or .xlsx file first.')
      return
    }
    setBulkUploading(true)
    setBulkError('')
    setBulkResult(null)

    const payload = new FormData()
    payload.append('file', bulkFile)

    try {
      const response = await axios.post(`${API}/listings/bulk-upload`, payload, {
        headers: authHeaders({ 'Content-Type': 'multipart/form-data' }),
      })
      setBulkResult(response.data)
    } catch (err) {
      setBulkError(err.response?.data?.detail || 'Could not upload the file. Please try again.')
    } finally {
      setBulkUploading(false)
    }
  }

  return (
    <Box>
      <PageHeader
        title="Add a listing"
        description="Add one property, or bring a whole spreadsheet in at once."
      />

      <Box sx={{ maxWidth: 987 /* Fibonacci */ }}>
        <Section>
          <Box sx={{ px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` } }}>
            <Tabs
              value={mode}
              onChange={(_, v) => {
                setMode(v)
                setError('')
                setCreatedId(null)
                setBulkError('')
                setBulkResult(null)
              }}
            >
              <Tab label="One property" />
              <Tab label="From a spreadsheet" />
            </Tabs>
          </Box>

          {/* ------------------------------------------------ single ----- */}
          {mode === 0 && (
            <Box component="form" onSubmit={handleSubmit} sx={{ p: `${SPACE.xl}px` }}>
              {createdId && (
                <Alert
                  severity="success"
                  sx={{ mb: `${SPACE.xl}px` }}
                  action={
                    <Button size="small" onClick={() => navigate(`/property/${createdId}`)}>
                      View it
                    </Button>
                  }
                >
                  Listing #{createdId} added. The form is clear for the next one.
                </Alert>
              )}
              {error && (
                <Alert severity="error" sx={{ mb: `${SPACE.xl}px` }} onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: `${SPACE.lg}px` }}>
                <Autocomplete
                  freeSolo
                  options={propertyTypes}
                  value={formData.prop_type}
                  onInputChange={(_, v) => setFormData((p) => ({ ...p, prop_type: v || '' }))}
                  renderInput={(params) => (
                    <TextField {...params} label="Property type" required helperText="Pick one, or type a new one" />
                  )}
                />

                <TextField select label="Purpose" name="purpose" value={formData.purpose} onChange={handleChange} required fullWidth>
                  <MenuItem value="sale">For sale</MenuItem>
                  <MenuItem value="rent">For rent</MenuItem>
                </TextField>

                <Autocomplete
                  freeSolo
                  options={locations}
                  value={formData.location}
                  onInputChange={(_, v) => setFormData((p) => ({ ...p, location: v || '' }))}
                  renderInput={(params) => (
                    <TextField {...params} label="Location" required helperText="A new area is created if it is not in the list" />
                  )}
                />

                <TextField
                  label="Price (PKR)"
                  name="price"
                  type="number"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  fullWidth
                  inputProps={{ min: 0, step: 1000 }}
                  helperText={formData.purpose === 'rent' ? 'Rent per month' : 'Asking price'}
                />

                <TextField
                  label="Covered area"
                  name="covered_area"
                  type="number"
                  value={formData.covered_area}
                  onChange={handleChange}
                  required
                  fullWidth
                  inputProps={{ min: 0, step: 1 }}
                  helperText="Whatever unit your agency uses — keep it the same across listings"
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${SPACE.lg}px` }}>
                  <TextField
                    label="Bedrooms"
                    name="beds"
                    type="number"
                    value={formData.beds}
                    onChange={handleChange}
                    required
                    fullWidth
                    inputProps={{ min: 0, max: 20 }}
                  />
                  <TextField
                    label="Bathrooms"
                    name="baths"
                    type="number"
                    value={formData.baths}
                    onChange={handleChange}
                    required
                    fullWidth
                    inputProps={{ min: 0, max: 20 }}
                  />
                </Box>

                <Box sx={{ gridColumn: { md: '1 / -1' } }}>
                  <TextField
                    label="Amenities"
                    name="amenities"
                    value={formData.amenities}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Swimming pool, backup generator, covered parking"
                    helperText="Separate with commas. These show on the listing page and help the assistant answer questions."
                  />
                </Box>
              </Box>

              <Box
                sx={{
                  mt: `${SPACE.xl}px`,
                  p: `${SPACE.lg}px`,
                  border: `1px dashed ${palette.borderStrong}`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${SPACE.lg}px`,
                  flexWrap: 'wrap',
                }}
              >
                <Button variant="outlined" size="small" component="label">
                  {singleImages.length > 0 ? `${singleImages.length} selected` : 'Choose photos'}
                  <input type="file" hidden multiple accept="image/*" onChange={(e) => setSingleImages(Array.from(e.target.files || []))} />
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Optional. You can add them later from the listing page.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, justifyContent: 'flex-end', mt: `${SPACE.xl}px` }}>
                <Button variant="outlined" onClick={() => navigate('/')}>
                  Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={loading}>
                  {loading ? 'Adding…' : 'Add listing'}
                </Button>
              </Box>
            </Box>
          )}

          {/* -------------------------------------------------- bulk ----- */}
          {mode === 1 && (
            <Box component="form" onSubmit={handleBulkUpload} sx={{ p: `${SPACE.xl}px` }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: `${SPACE.lg}px`, maxWidth: '72ch' }}>
                Your file needs a header row with these column names. Capitalisation does not matter. Everything except
                amenities is required.
              </Typography>

              <TableContainer sx={{ border: `1px solid ${palette.border}`, borderRadius: '8px', mb: `${SPACE.lg}px` }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {CSV_COLUMNS.map((c) => (
                        <TableCell key={c} sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textTransform: 'none' }}>
                          {c}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      {CSV_EXAMPLE.map((v, i) => (
                        <TableCell key={i} sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {v}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', gap: `${SPACE.lg}px`, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="outlined" size="small" component="label">
                  {bulkFile ? bulkFile.name : 'Choose file'}
                  <input
                    type="file"
                    hidden
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      setBulkFile(e.target.files?.[0] || null)
                      setBulkResult(null)
                      setBulkError('')
                    }}
                  />
                </Button>
                <Button variant="text" size="small" onClick={handleDownloadTemplate} sx={{ color: 'text.secondary' }}>
                  Download a blank template
                </Button>
              </Box>

              {bulkError && (
                <Alert severity="error" sx={{ mt: `${SPACE.lg}px` }}>
                  {bulkError}
                </Alert>
              )}

              {bulkResult && (
                <Alert severity={bulkResult.rows_failed > 0 ? 'warning' : 'success'} sx={{ mt: `${SPACE.lg}px` }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {bulkResult.rows_inserted} of {bulkResult.rows_received} rows added
                    {bulkResult.rows_failed > 0 ? `, ${bulkResult.rows_failed} failed` : ''}
                    {bulkResult.rows_duplicates_skipped > 0
                      ? `, ${bulkResult.rows_duplicates_skipped} duplicate${bulkResult.rows_duplicates_skipped === 1 ? '' : 's'} skipped`
                      : ''}
                    .
                  </Typography>
                  {bulkResult.errors && bulkResult.errors.length > 0 && (
                    <Box component="ul" sx={{ m: 0, mt: `${SPACE.md}px`, pl: `${SPACE.xl}px`, maxHeight: 233, overflowY: 'auto' }}>
                      {bulkResult.errors.map((err, idx) => (
                        <Box component="li" key={idx} sx={{ fontSize: 12, mb: '2px' }}>
                          {err}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, justifyContent: 'flex-end', mt: `${SPACE.xl}px` }}>
                <Button variant="outlined" onClick={() => navigate('/')}>
                  {bulkResult ? 'Done' : 'Cancel'}
                </Button>
                <Button type="submit" variant="contained" disabled={bulkUploading || !bulkFile}>
                  {bulkUploading ? 'Uploading…' : 'Upload file'}
                </Button>
              </Box>
            </Box>
          )}
        </Section>
      </Box>
    </Box>
  )
}
