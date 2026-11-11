/**
 * The semantic assistant (/chat): describe what you want in plain words and it
 * searches the indexed listings.
 *
 * Rewritten to use the shared ChatShell, so it matches the listings assistant.
 * The floating-button mode is gone: nothing mounted it (the app routes
 * /chatbot straight to the full-page view), so it was dead code carrying the
 * pulsing-FAB animation with it.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import { API } from '../auth'
import { SPACE, palette } from '../theme'
import ChatFrame, { Composer, MessageRow, MessageSurface, Starters, ThinkingRow } from './ChatShell'

const STORAGE_KEY = 'zameen_chat_history_v2'
const HF_MODEL = import.meta.env.VITE_HF_CHAT_MODEL || ''

const STARTERS = [
  'A family home near good schools with a backup generator',
  'Somewhere quiet for a retired couple, two bedrooms',
  'A flat to rent close to the city centre',
  'An investment property with strong rental demand',
]

async function getBotReply(messages) {
  const payload = {
    messages: messages.map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })),
    model: HF_MODEL || undefined,
  }
  try {
    const resp = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await resp.json().catch(() => ({}))
    return {
      text: (data.response || "Sorry, I couldn't answer that.").trim(),
      properties: data.properties || [],
    }
  } catch {
    return { text: 'Could not reach the assistant. Check your connection and try again.', properties: [] }
  }
}

export default function Chatbot() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const listRef = useRef(null)
  const sendDebounceRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setMessages(JSON.parse(raw))
    } catch {
      /* no stored history */
    }
    setHydrated(true)
  }, [])

  // The semantic index takes a while to load on a cold server, so wait for
  // /health rather than letting the first question fail.
  useEffect(() => {
    let mounted = true
    let timer

    async function check() {
      try {
        const resp = await fetch(`${API}/health`)
        if (resp.ok) {
          const data = await resp.json()
          if (data && data.status === 'ok') {
            if (mounted) setReady(true)
            return
          }
        }
      } catch {
        /* server not up yet */
      }
      if (mounted) timer = setTimeout(check, 2000)
    }

    check()
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      /* storage blocked or full */
    }
  }, [messages, hydrated])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    }, 60)
    return () => clearTimeout(timer)
  }, [messages, loading])

  async function send(text) {
    const value = (text ?? input).trim()
    if (!value || loading || !ready) return
    if (sendDebounceRef.current) return
    sendDebounceRef.current = true
    setTimeout(() => (sendDebounceRef.current = false), 600)

    const lastUser = [...messages].reverse().find((m) => m.from === 'user')
    if (lastUser && lastUser.text.trim() === value) {
      setInput('')
      return
    }

    const newHistory = [...messages, { from: 'user', text: value, time: Date.now() }]
    setInput('')
    setLoading(true)
    setMessages(newHistory)

    let botPayload = { text: '', properties: [] }
    try {
      botPayload = await getBotReply(newHistory)
    } catch {
      botPayload = { text: 'Could not reach the assistant.', properties: [] }
    }

    const botMsg = { from: 'bot', text: botPayload.text, properties: botPayload.properties || [], time: Date.now() }
    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((m) => m.from === 'bot')
      if (lastAssistant?.text && botMsg.text && lastAssistant.text.trim() === botMsg.text.trim()) return prev
      return [...prev, botMsg]
    })
    setLoading(false)
  }

  return (
    <ChatFrame
      ref={listRef}
      title="Describe & find"
      subtitle="Say what the buyer is after in your own words, and this searches for the closest matches."
      showClear={messages.length > 0}
      onClear={() => {
        setMessages([])
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* nothing stored */
        }
      }}
      composer={
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          disabled={loading || !ready}
          placeholder={ready ? 'Describe what they are looking for' : 'Waiting for the assistant to start…'}
        />
      }
      overlay={
        !ready && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(251,250,249,0.86)',
              zIndex: 2,
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ mt: `${SPACE.md}px`, color: 'text.secondary' }}>
                Starting the assistant…
              </Typography>
            </Box>
          </Box>
        )
      }
    >
      {messages.length === 0 && (
        <Starters
          title="Describe the buyer, not the filters"
          description="This one reads your description and finds listings that fit the sense of it."
          prompts={STARTERS}
          onPick={send}
        />
      )}

      {messages.map((m, idx) => {
        const isUser = m.from === 'user'
        return (
          <MessageRow key={m.time || idx} who={m.from}>
            <MessageSurface who={m.from}>
              <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-line', lineHeight: 1.55 }}>{m.text}</Typography>
            </MessageSurface>

            {!isUser && Array.isArray(m.properties) && m.properties.length > 0 && (
              <Box sx={{ mt: `${SPACE.md}px`, display: 'flex', flexWrap: 'wrap', gap: `${SPACE.md}px` }}>
                {m.properties
                  .filter((p) => p?.id)
                  .map((p, i) => (
                    <Box
                      key={p.id || i}
                      component={RouterLink}
                      to={p.detail_url || `/property/${p.id}`}
                      sx={{
                        px: `${SPACE.lg}px`,
                        py: `${SPACE.sm}px`,
                        fontSize: 12.5,
                        fontWeight: 550,
                        borderRadius: '6px',
                        textDecoration: 'none',
                        color: palette.accent,
                        bgcolor: palette.surface,
                        border: `1px solid ${palette.accentBorder}`,
                        '&:hover': { bgcolor: palette.accentSoft },
                      }}
                    >
                      Property {p.id}
                      {p.location ? ` · ${p.location}` : ''}
                    </Box>
                  ))}
              </Box>
            )}
          </MessageRow>
        )
      })}

      {loading && <ThinkingRow label="Searching listings…" />}
    </ChatFrame>
  )
}
