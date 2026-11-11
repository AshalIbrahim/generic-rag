/**
 * Sign-in.
 *
 * Rewritten: this page used a purple gradient and shadow found nowhere else in
 * the product, so the first screen set an expectation the rest of the app did
 * not keep. It now uses the same neutral surface, accent and type scale as
 * every other page.
 *
 * The layout is a 61.8 / 38.2 split on desktop -- the form sits in the minor
 * column, with the majority given to a plain statement of what this tool is.
 * On mobile the panel stands alone.
 */
import React, { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'

import { API } from '../auth'
import { SPACE, SPLIT, palette } from '../theme'

const FEATURES = [
  ['Listings', 'Search the agency inventory, with photos and location notes.'],
  ['Leads & follow-ups', 'Keep track of who to call next, and what was said last time.'],
  ['Sales & commissions', 'Record closed deals; splits are worked out for you.'],
]

export default function Login({ onLoginSuccess }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Enter your email and password.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const resp = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'That email and password did not match.')
        return
      }
      if (!data.token) {
        setError('Signed in, but no access token came back. Ask your agency owner to check the server.')
        return
      }
      localStorage.setItem('token', data.token)
      if (onLoginSuccess) {
        onLoginSuccess({ id: data.id, email: data.email, role: data.role, tenant_id: data.tenant_id })
      }
    } catch (err) {
      console.error('login', err)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: palette.canvas,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: `${SPACE.xl}px`, md: `${SPACE.xxl}px` },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 987, // Fibonacci
          display: 'flex',
          alignItems: 'stretch',
          gap: `${SPACE.xxl}px`,
        }}
      >
        {/* Major column: what this is. Hidden on small screens, where the form
            is the only thing that matters. */}
        <Box
          sx={{
            width: SPLIT.major,
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            justifyContent: 'center',
            pr: `${SPACE.xl}px`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.lg}px`, mb: `${SPACE.xl}px` }}>
            <Box
              aria-hidden
              sx={{
                width: 29,
                height: 29,
                borderRadius: '8px',
                bgcolor: palette.accent,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Z
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 620 }}>Zameen</Typography>
          </Box>

          <Typography variant="h1" sx={{ fontSize: 28, mb: `${SPACE.lg}px` }}>
            The workspace for your agency
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '48ch', mb: `${SPACE.xl}px` }}>
            One place for your listings, your buyers and what everyone on the team has closed.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.lg}px` }}>
            {FEATURES.map(([title, detail]) => (
              <Box key={title} sx={{ display: 'flex', gap: `${SPACE.lg}px` }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 5,
                    borderRadius: 3,
                    bgcolor: palette.accentBorder,
                    flexShrink: 0,
                    mt: '3px',
                    mb: '3px',
                  }}
                />
                <Box>
                  <Typography variant="h4">{title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.xxs}px` }}>
                    {detail}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Minor column: the form. */}
        <Paper
          variant="outlined"
          sx={{
            width: { xs: '100%', md: SPLIT.minor },
            maxWidth: { xs: 377, md: 'none' }, // Fibonacci
            mx: { xs: 'auto', md: 0 },
            p: { xs: `${SPACE.xl}px`, sm: `${SPACE.xxl}px` },
            alignSelf: 'center',
          }}
        >
          {/* Brand repeats here for mobile, where the left column is hidden. */}
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              alignItems: 'center',
              gap: `${SPACE.md}px`,
              mb: `${SPACE.xl}px`,
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 26,
                height: 26,
                borderRadius: '7px',
                bgcolor: palette.accent,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Z
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 620 }}>Zameen</Typography>
          </Box>

          <Typography variant="h2" component="h1">
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.sm}px`, mb: `${SPACE.xl}px` }}>
            Use the account your agency owner set up for you.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: `${SPACE.lg}px` }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.lg}px` }}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                autoFocus
              />
              <TextField
                fullWidth
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((p) => !p)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <VisibilityOffOutlined sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityOutlined sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{ mt: `${SPACE.xl}px`, minHeight: 38 }}
            >
              {loading ? <CircularProgress size={17} sx={{ color: 'inherit' }} /> : 'Sign in'}
            </Button>
          </Box>

          <Typography variant="caption" sx={{ display: 'block', mt: `${SPACE.xl}px`, color: 'text.secondary' }}>
            Accounts are created by your agency owner. If you cannot get in, ask them to reset your password.
          </Typography>
        </Paper>
      </Box>
    </Box>
  )
}
