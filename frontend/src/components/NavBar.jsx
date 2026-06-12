import React from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Link as RouterLink } from 'react-router-dom'
import Link from '@mui/material/Link'

export default function NavBar(){
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
          Zameen
        </Typography>
        <Link component={RouterLink} to="/" color="inherit" underline="none">
          <Button 
            color="inherit"
            sx={{
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.16)',
                transform: 'translateY(-1px)',
              },
              transition: 'all .2s ease',
            }}
          >
            Listings
          </Button>
        </Link>
        <Link component={RouterLink} to="/locations" color="inherit" underline="none">
          <Button 
            color="inherit"
            sx={{
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            Locations
          </Button>
        </Link>
        
        <Link component={RouterLink} to="/add-listing" color="inherit" underline="none">
  <Button 
    color="inherit"
    sx={{
      '&:hover': {
        background: 'rgba(255, 255, 255, 0.1)',
      },
    }}
  >
    Add Listing
  </Button>
</Link>
        <Link component={RouterLink} to="/chatbot" color="inherit" underline="none">
          <Button 
            color="inherit"
            sx={{
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            Chatbot
          </Button>
        </Link>
      </Toolbar>
    </AppBar>
  )
}
