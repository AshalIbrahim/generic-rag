import React, { useState, useEffect } from 'react'
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Fade,
  Slide,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { motion } from 'framer-motion'
import Chatbot from '../components/Chatbot'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function CompareProperties() {
  const navigate = useNavigate()
  const [propertyId1, setPropertyId1] = useState('')
  const [propertyId2, setPropertyId2] = useState('')
  const [question, setQuestion] = useState('Compare these two properties in detail.')
  const [property1, setProperty1] = useState(null)
  const [property2, setProperty2] = useState(null)
  const [comparison, setComparison] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [property1Error, setProperty1Error] = useState('')
  const [property2Error, setProperty2Error] = useState('')

  const fetchProperty = async (id, setProperty, setError) => {
    if (!id) {
      setProperty(null)
      setError('')
      return
    }
    
    try {
      setError('')
      console.log(`[CompareProperties] 🔍 Fetching property ID: ${id}`)
      const response = await axios.get(`${API}/listings/${id}`)
      console.log(`[CompareProperties] ✅ Property ${id} fetched:`, response.data)
      setProperty(response.data)
    } catch (err) {
      console.error(`[CompareProperties] ❌ Error fetching property ${id}:`, err)
      setProperty(null)
      setError(err.response?.status === 404 ? 'Property not found' : 'Error loading property')
    }
  }

  useEffect(() => {
    if (propertyId1) {
      const id = parseInt(propertyId1)
      if (!isNaN(id)) {
        fetchProperty(id, setProperty1, setProperty1Error)
      } else {
        setProperty1(null)
        setProperty1Error('Invalid property ID')
      }
    } else {
      setProperty1(null)
      setProperty1Error('')
    }
  }, [propertyId1])

  useEffect(() => {
    if (propertyId2) {
      const id = parseInt(propertyId2)
      if (!isNaN(id)) {
        fetchProperty(id, setProperty2, setProperty2Error)
      } else {
        setProperty2(null)
        setProperty2Error('Invalid property ID')
      }
    } else {
      setProperty2(null)
      setProperty2Error('')
    }
  }, [propertyId2])

  const handleCompare = async () => {
    if (!propertyId1 || !propertyId2) {
      setError('Please enter both property IDs')
      return
    }

    if (!property1 || !property2) {
      setError('Please ensure both properties are loaded')
      return
    }

    setLoading(true)
    setError('')
    setComparison('')

    try {
      const payload = {
        property_id_1: parseInt(propertyId1),
        property_id_2: parseInt(propertyId2),
        question: question,
      };
      
      console.log('[CompareProperties] 📤 Sending comparison request:', payload);
      
      const response = await axios.post(`${API}/compare`, payload);
      
      console.log('[CompareProperties] 📥 Received comparison response:', {
        hasComparison: !!response.data.comparison,
        comparisonLength: response.data.comparison?.length || 0,
        comparisonPreview: response.data.comparison?.substring(0, 100) || 'No comparison'
      });

      setComparison(response.data.comparison)
    } catch (err) {
      console.error('[CompareProperties] ❌ Comparison error:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message
      });
      setError(err.response?.data?.detail || 'Failed to generate comparison. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (p) => {
    if (p === undefined || p === null) return 'N/A'
    const num = Number(p)
    if (Number.isNaN(num)) return p
    return num.toLocaleString(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Fade in timeout={600}>
        <Paper
          elevation={8}
          sx={{
            p: 4,
            borderRadius: 4,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(250,250,255,0.95))',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            mb: 4,
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
              Compare Properties
            </Typography>
          </Slide>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Property ID 1"
                  type="number"
                  value={propertyId1}
                  onChange={(e) => setPropertyId1(e.target.value)}
                  fullWidth
                  error={!!property1Error}
                  helperText={property1Error || 'Enter the first property ID'}
                />
                {property1 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 2 }}>
                      <CardContent>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                          {property1.prop_type || 'Property'} (ID: {property1.id})
                          <Chip label={property1.purpose || 'N/A'} size="small" sx={{ ml: 1 }} />
                        </Typography>
                        <Typography variant="subtitle1" sx={{ color: '#667eea', fontWeight: 700 }}>
                          {formatPrice(property1.price)}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          <strong>Location:</strong> {property1.location || 'N/A'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Area:</strong> {property1.covered_area || 'N/A'} sqft
                        </Typography>
                        <Typography variant="body2">
                          <strong>Beds:</strong> {property1.beds || 'N/A'} | <strong>Baths:</strong> {property1.baths || 'N/A'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="Property ID 2"
                  type="number"
                  value={propertyId2}
                  onChange={(e) => setPropertyId2(e.target.value)}
                  fullWidth
                  error={!!property2Error}
                  helperText={property2Error || 'Enter the second property ID'}
                />
                {property2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card sx={{ mt: 2, borderRadius: 2, boxShadow: 2 }}>
                      <CardContent>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                          {property2.prop_type || 'Property'} (ID: {property2.id})
                          <Chip label={property2.purpose || 'N/A'} size="small" sx={{ ml: 1 }} />
                        </Typography>
                        <Typography variant="subtitle1" sx={{ color: '#667eea', fontWeight: 700 }}>
                          {formatPrice(property2.price)}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          <strong>Location:</strong> {property2.location || 'N/A'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Area:</strong> {property2.covered_area || 'N/A'} sqft
                        </Typography>
                        <Typography variant="body2">
                          <strong>Beds:</strong> {property2.beds || 'N/A'} | <strong>Baths:</strong> {property2.baths || 'N/A'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </Grid>
            </Grid>

            <TextField
              label="Comparison Question (optional)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Compare these two properties in detail."
            />

            {error && (
              <Fade in timeout={400}>
                <Alert severity="error">{error}</Alert>
              </Fade>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
                sx={{
                  borderColor: '#667eea',
                  color: '#667eea',
                  '&:hover': {
                    borderColor: '#764ba2',
                    background: 'rgba(102,126,234,0.08)',
                  },
                }}
              >
                Back to Listings
              </Button>
              <Button
                variant="contained"
                onClick={handleCompare}
                disabled={loading || !property1 || !property2}
                sx={{
                  minWidth: 150,
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
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Compare Properties'}
              </Button>
            </Box>
          </Box>
        </Paper>
      </Fade>

      {comparison && (
        <Fade in timeout={600}>
          <Paper
            elevation={8}
            sx={{
              p: 4,
              borderRadius: 4,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(250,250,255,0.95))',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              mt: 3,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                mb: 2,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Comparison Result
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Typography
              variant="body1"
              sx={{
                whiteSpace: 'pre-line',
                lineHeight: 1.8,
                color: 'text.primary',
              }}
            >
              {comparison}
            </Typography>
          </Paper>
        </Fade>
      )}

      {/* Space for chatbot response */}
      <Box sx={{ mt: 4, mb: 8, minHeight: '400px' }}>
        <Chatbot fullPage={false} />
      </Box>
    </Container>
  )
}
