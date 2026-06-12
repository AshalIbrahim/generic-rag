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
        </Paper>
      </Fade>
    </Container>
  )
}
