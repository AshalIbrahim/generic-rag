import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import './styles.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0f766e' },
    secondary: { main: '#f59e0b' },
    background: { default: '#f4fbfa', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#334155' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h6: { fontWeight: 700, letterSpacing: '0.2px' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
})

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <CssBaseline />
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
)
