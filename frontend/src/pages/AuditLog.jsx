import React, { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    api('/app/v1/audit').then(setRows).catch((e) => setError(e.message))
  }, [])
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Audit log</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <ResourceTable rows={rows} columns={[
        { key: 'created_at', label: 'Time' },
        { key: 'actor_account_id', label: 'Actor' },
        { key: 'action', label: 'Action' },
        { key: 'resource_type', label: 'Resource' },
        { key: 'resource_id', label: 'ID' },
      ]} />
    </Box>
  )
}

