import React, { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { api } from '../lib/api'
import ResourceTable from '../components/ResourceTable'

export default function Team() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    api('/app/v1/team').then(setRows).catch((e) => setError(e.message))
  }, [])
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>Team</Typography>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <ResourceTable rows={rows} columns={[
        { key: 'full_name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'phone', label: 'Phone' },
        { key: 'is_active', label: 'Active', render: (row) => row.is_active ? 'Yes' : 'No' },
      ]} />
    </Box>
  )
}

