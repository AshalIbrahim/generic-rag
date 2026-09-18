import React, { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { account } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/app/v1/dashboard').then(setStats).catch((e) => setError(e.message))
  }, [])

  if (error) return <Alert severity="warning">{error}</Alert>
  if (!stats) return <CircularProgress />

  const cards = [
    ['Properties', stats.properties],
    ['Open leads', stats.open_leads],
    ['Sales', stats.sales],
    ['Sales volume', Number(stats.volume || 0).toLocaleString()],
  ]

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
        Dashboard
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>
        {account?.tenant_name || 'Agency'} overview
      </Typography>
      <Grid container spacing={2}>
        {cards.map(([label, value]) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography color="text.secondary">{label}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

