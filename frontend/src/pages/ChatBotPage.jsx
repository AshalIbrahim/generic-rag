import React from 'react'
import Chatbot from '../components/Chatbot'
import Container from '@mui/material/Container'

export default function ChatBotPage() {
  return (
    <Container maxWidth={false} sx={{ mt: 6 }}>
      <Chatbot fullPage={true} />
    </Container>
  )
}
