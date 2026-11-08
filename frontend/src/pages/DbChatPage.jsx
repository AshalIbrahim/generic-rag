import React from 'react'
import DbChatbot from '../components/DbChatbot'
import Container from '@mui/material/Container'

export default function DbChatPage() {
  return (
    <Container maxWidth={false} sx={{ mt: 6 }}>
      <DbChatbot />
    </Container>
  )
}
