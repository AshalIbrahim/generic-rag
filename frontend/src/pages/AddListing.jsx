import React, { useState, useEffect } from 'react'
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  MenuItem,
  Alert,
  CircularProgress,
  Fade,
  Slide,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItem,
  ListItemText,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function AddListing() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    prop_type: '',
    purpose: 'sale',
    covered_area: '',
    price: '',
    location: '',
    beds: '',
    baths: '',
    amenities: '',
  })
  const [locations, setLocations] = useState([])
  const [propertyTypes, setPropertyTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [mode, setMode] = useState('single') // 'single' or 'bulk'
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkError, setBulkError] = useState('')

  useEffect(() => {
    fetchOptions()
  }, [])

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

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const response = await axios.post(`${API}/listings/add`, {
        prop_type: formData.prop_type,
        purpose: formData.purpose,
        covered_area: parseFloat(formData.covered_area),
        price: parseFloat(formData.price),
        location: formData.location,
        beds: parseInt(formData.beds, 10),
        baths: parseInt(formData.baths, 10),
        amenities: formData.amenities || '',
      })

      if (response.data.success) {
        setSuccess(true)
        setTimeout(() => {
          navigate('/')
        }, 2000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add listing. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleModeChange = (e, newMode) => {
    if (newMode === null) return
    setMode(newMode)
    setError('')
    setSuccess(false)
    setBulkError('')
    setBulkResult(null)
  }

  const handleDownloadTemplate = () => {
    const header = 'prop_type,purpose,covered_area,price,location,beds,baths,amenities'
    const example = 'House,For Sale,2200,450000,"Austin, Texas",4,3,"Garage,Backyard,Central AC"'
    const csvContent = `${header}\n${example}\n`
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'listings_template.csv'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const handleBulkFileChange = (e) => {
    const selected = e.target.files?.[0] || null
    setBulkFile(selected)
    setBulkResult(null)
    setBulkError('')
  }

  const handleBulkUpload = async (e) => {
    e.preventDefault()
    if (!bulkFile) {
      setBulkError('Please choose a .csv or .xlsx file first.')
      return
    }
    setBulkUploading(true)
    setBulkError('')
    setBulkResult(null)

    const payload = new FormData()
    payload.append('file', bulkFile)

    try {
      const response = await axios.post(`${API}/listings/bulk-upload`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setBulkResult(response.data)
    } catch (err) {
      setBulkError(err.response?.data?.detail || 'Failed to upload file. Please try again.')
    } finally {
      setBulkUploading(false)
    }
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Fade in timeout={600}>
        <Paper
          elevation={8}
          sx={{
            p: 4,
            borderRadius: 4,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(250,250,255,0.95))',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }}
        >
          <Slide direction="down" in timeout={500}>
            <Typography
              variant="h4"
              sx={{
                mb: 3,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center',
              }}
            >
              Add New Listing
            </Typography>
          </Slide>

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={handleModeChange}
              size="small"
              sx={{
                '& .MuiToggleButton-root.Mui-selected': {
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                  },
                },
              }}
            >
              <ToggleButton value="single">Single Listing</ToggleButton>
              <ToggleButton value="bulk">Bulk Upload</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {success && (
            <Fade in timeout={400}>
              <Alert severity="success" sx={{ mb: 3 }}>
                Listing added successfully! Redirecting to listings...
              </Alert>
            </Fade>
          )}

          {error && (
            <Fade in timeout={400}>
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            </Fade>
          )}

          {mode === 'single' && (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <TextField
                select
                label="Property Type"
                name="prop_type"
                value={formData.prop_type}
                onChange={handleChange}
                required
                fullWidth
                SelectProps={{
                  MenuProps: {
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                      },
                    },
                  },
                }}
              >
                {propertyTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Purpose"
                name="purpose"
                value={formData.purpose}
                onChange={handleChange}
                required
                fullWidth
              >
                <MenuItem value="sale">For Sale</MenuItem>
                <MenuItem value="rent">For Rent</MenuItem>
              </TextField>

              <TextField
                label="Location"
                name="location"
                select
                value={formData.location}
                onChange={handleChange}
                required
                fullWidth
                SelectProps={{
                  MenuProps: {
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                      },
                    },
                  },
                }}
              >
                {locations.map((loc) => (
                  <MenuItem key={loc} value={loc}>
                    {loc}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Price (PKR)"
                name="price"
                type="number"
                value={formData.price}
                onChange={handleChange}
                required
                fullWidth
                inputProps={{ min: 0, step: 1000 }}
              />

              <TextField
                label="Covered Area (sqft)"
                name="covered_area"
                type="number"
                value={formData.covered_area}
                onChange={handleChange}
                required
                fullWidth
                inputProps={{ min: 0, step: 1 }}
              />

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

            <TextField
              label="Amenities (optional)"
              name="amenities"
              value={formData.amenities}
              onChange={handleChange}
              fullWidth
              multiline
              rows={3}
              placeholder="e.g., Swimming pool, Gym, Parking, Security..."
            />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
                sx={{
                  borderColor: '#667eea',
                  color: '#667eea',
                  '&:hover': {
                    borderColor: '#764ba2',
                    background: 'rgba(102, 126, 234, 0.08)',
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  minWidth: 120,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                    boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)',
                    transform: 'translateY(-2px)',
                  },
                  '&:disabled': {
                    background: '#ccc',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Add Listing'}
              </Button>
            </Box>
          </Box>
          )}

          {mode === 'bulk' && (
          <Box component="form" onSubmit={handleBulkUpload} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Your file needs a header row with these exact column names. Columns are matched
              case-insensitively; amenities is optional, everything else is required.
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, background: 'rgba(102, 126, 234, 0.08)' } }}>
                    <TableCell>prop_type</TableCell>
                    <TableCell>purpose</TableCell>
                    <TableCell>covered_area</TableCell>
                    <TableCell>price</TableCell>
                    <TableCell>location</TableCell>
                    <TableCell>beds</TableCell>
                    <TableCell>baths</TableCell>
                    <TableCell>amenities</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>House</TableCell>
                    <TableCell>For Sale</TableCell>
                    <TableCell>2200</TableCell>
                    <TableCell>450000</TableCell>
                    <TableCell>Austin, Texas</TableCell>
                    <TableCell>4</TableCell>
                    <TableCell>3</TableCell>
                    <TableCell>Garage, Backyard</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Button
              variant="text"
              onClick={handleDownloadTemplate}
              sx={{ alignSelf: 'flex-start', color: '#667eea', textTransform: 'none', fontWeight: 600 }}
            >
              Download blank template (.csv)
            </Button>

            <Button
              variant="outlined"
              component="label"
              sx={{
                borderColor: '#667eea',
                color: '#667eea',
                alignSelf: 'flex-start',
                '&:hover': {
                  borderColor: '#764ba2',
                  background: 'rgba(102, 126, 234, 0.08)',
                },
              }}
            >
              {bulkFile ? bulkFile.name : 'Choose File'}
              <input
                type="file"
                hidden
                accept=".csv,.xlsx,.xls"
                onChange={handleBulkFileChange}
              />
            </Button>

            {bulkError && (
              <Fade in timeout={400}>
                <Alert severity="error">{bulkError}</Alert>
              </Fade>
            )}

            {bulkResult && (
              <Fade in timeout={400}>
                <Alert severity={bulkResult.rows_failed > 0 ? 'warning' : 'success'}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {bulkResult.rows_inserted} of {bulkResult.rows_received} rows added
                    {bulkResult.rows_failed > 0 ? `, ${bulkResult.rows_failed} failed` : ''}.
                  </Typography>
                  {bulkResult.errors && bulkResult.errors.length > 0 && (
                    <List dense sx={{ maxHeight: 200, overflowY: 'auto', mt: 1 }}>
                      {bulkResult.errors.map((err, idx) => (
                        <ListItem key={idx} sx={{ py: 0 }}>
                          <ListItemText primaryTypographyProps={{ variant: 'caption' }} primary={err} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Alert>
              </Fade>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
                sx={{
                  borderColor: '#667eea',
                  color: '#667eea',
                  '&:hover': {
                    borderColor: '#764ba2',
                    background: 'rgba(102, 126, 234, 0.08)',
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={bulkUploading || !bulkFile}
                sx={{
                  minWidth: 120,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                    boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)',
                    transform: 'translateY(-2px)',
                  },
                  '&:disabled': {
                    background: '#ccc',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                {bulkUploading ? <CircularProgress size={24} color="inherit" /> : 'Upload File'}
              </Button>
            </Box>
          </Box>
          )}
        </Paper>
      </Fade>
    </Container>
  )
}
