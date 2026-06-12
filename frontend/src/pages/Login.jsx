import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

console.log('API URL:', import.meta.env.VITE_API_URL)
const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Login({ onLoginSuccess }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Please fill in all fields.')
      return
    }
    try {
      console.log('Inside login function')
      setLoading(true)
      setError('')
      const resp = await fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.detail || 'Invalid email or password.')
        return
      }
      if (onLoginSuccess) onLoginSuccess(data)
    } catch (err) {
      console.error('login', err)
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f3e5f5 0%, #ede7f6 50%, #e8eaf6 100%)',
        px: 2,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 4,
          boxShadow: '0 8px 40px rgba(106,27,154,0.12)',
          background: 'linear-gradient(135deg, rgba(103,58,183,0.06), rgba(156,39,176,0.03))',
          border: '1px solid rgba(142,36,170,0.12)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8e24aa, #5e35b1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
                boxShadow: '0 4px 14px rgba(142,36,170,0.35)',
              }}
            >
              {/* Home / key icon using pure SVG */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L3 9v11a1 1 0 001 1h5v-6h6v6h5a1 1 0 001-1V9L12 2z"
                  fill="white"
                  opacity="0.9"
                />
              </svg>
            </Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, color: '#4a148c', letterSpacing: '-0.5px' }}
            >
              Welcome back
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(0,0,0,0.5)', mt: 0.5 }}>
              Sign in to your account to continue
            </Typography>
          </Box>

          {/* Error */}
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              fullWidth
              label="Email address"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              size="small"
              sx={fieldSx}
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              size="small"
              sx={{ ...fieldSx, mt: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(p => !p)}
                      edge="end"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e24aa" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e24aa" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ textAlign: 'right', mt: 1 }}>
              <Typography
                variant="caption"
                sx={{ color: '#8e24aa', cursor: 'pointer', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
              >
                Forgot password?
              </Typography>
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                mt: 2.5,
                py: 1.3,
                borderRadius: 2.5,
                background: 'linear-gradient(135deg, #8e24aa, #5e35b1)',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 0.3,
                textTransform: 'none',
                boxShadow: '0 4px 14px rgba(142,36,170,0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #7b1fa2, #512da8)',
                  boxShadow: '0 6px 20px rgba(142,36,170,0.4)',
                },
                '&:disabled': {
                  background: 'rgba(142,36,170,0.3)',
                },
              }}
            >
              {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Sign in'}
            </Button>
          </Box>

          <Divider sx={{ my: 3, borderColor: 'rgba(142,36,170,0.15)' }} />

          <Typography variant="body2" sx={{ textAlign: 'center', color: 'rgba(0,0,0,0.55)' }}>
            Don't have an account?{' '}
            <Typography
              component="span"
              variant="body2"
              sx={{ color: '#8e24aa', fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              Sign up
            </Typography>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    '& fieldset': { borderColor: 'rgba(142,36,170,0.25)' },
    '&:hover fieldset': { borderColor: '#8e24aa' },
    '&.Mui-focused fieldset': { borderColor: '#8e24aa' },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#8e24aa' },
}