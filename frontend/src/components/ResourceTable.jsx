import React from 'react'
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

export default function ResourceTable({ columns, rows, empty = 'No records yet.' }) {
  if (!rows?.length) {
    return (
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography color="text.secondary">{empty}</Typography>
      </Paper>
    )
  }

  return (
    <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} sx={{ fontWeight: 700 }}>
                {column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id || JSON.stringify(row)} hover>
              {columns.map((column) => (
                <TableCell key={column.key}>
                  {column.render ? column.render(row) : row[column.key] ?? '-'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

