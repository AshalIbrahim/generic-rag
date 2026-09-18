import React, { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

export default function Conversations() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    api('/app/v1/conversations').then(setRows).catch((e) => setError(e.message))
  }, [])
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Conversations</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <ResourceTable rows={rows} columns={[
        { key: 'id', label: 'ID' },
        { key: 'session_id', label: 'Session' },
        { key: 'lead_id', label: 'Lead' },
        { key: 'channel', label: 'Channel' },
        { key: 'bot_enabled', label: 'Bot', render: (row) => row.bot_enabled ? 'On' : 'Off' },
      ]} />
    </Box>
  )
}

