import React from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Link as RouterLink } from 'react-router-dom'
import Link from '@mui/material/Link'
import { useAuth } from '../context/AuthContext'

export default function NavBar(){
  const { account, signOut } = useAuth()
  const navItems = [
    ['Dashboard', '/'],
    ['Listings', '/listings'],
    ['Leads', '/leads'],
    ['Sales', '/sales'],
    ['Follow-ups', '/follow-ups'],
    ['Conversations', '/conversations'],
    ['Team', '/team'],
    ['Audit', '/audit'],
    ['Chatbot', '/chatbot'],
  ]

  return (
    <AppBar 
      position="static"
      sx={{
        background: 'linear-gradient(100deg, #0f766e, #14b8a6, #0ea5a3)',
        boxShadow: '0 8px 28px rgba(15, 118, 110, 0.28)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {account?.tenant_name || 'Zameen'}
        </Typography>
        {navItems.map(([label, path]) => (
          <Link key={path} component={RouterLink} to={path} color="inherit" underline="none">
            <Button
              color="inherit"
              size="small"
              sx={{
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.16)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all .2s ease',
              }}
            >
              {label}
            </Button>
          </Link>
        ))}
        <Link component={RouterLink} to="/add-listing" color="inherit" underline="none">
          <Button
            color="inherit"
            size="small"
            sx={{
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            Add Listing
          </Button>
        </Link>
        <Button color="inherit" size="small" onClick={signOut}>Sign out</Button>
      </Toolbar>
    </AppBar>
  )
}
