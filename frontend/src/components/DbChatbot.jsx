/**
 * The assistant that answers from the listings table (/chat-db).
 *
 * Its replies arrive as sanitised HTML with links to listing pages, so they
 * are rendered as markup; the chrome around it comes from ChatShell, shared
 * with the semantic assistant.
 *
 * The starter prompts only suggest things it can actually do: the backend now
 * refuses anything outside property work, so inviting it would just produce a
 * refusal.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { API, authHeaders } from '../auth'
import { SPACE } from '../theme'
import ChatFrame, { Composer, MessageRow, MessageSurface, Starters, ThinkingRow } from './ChatShell'

const STORAGE_KEY = 'zameen_db_chat_history_v1'

const STARTERS = [
  '3 bed houses in DHA under 2 crore',
  'Cheapest apartments for rent in Clifton',
  'Compare the two cheapest houses you have',
  'Write talking points for property 12',
]

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || '')
}

function HtmlReply({ html }) {
  const navigate = useNavigate()

  function onClick(event) {
    const anchor = event.target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    if (href.startsWith('/')) {
      event.preventDefault()
      navigate(href)
    }
  }

  return <Box className="chat-html" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

async function getBotReply(messages) {
  const payload = {
    messages: messages.map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })),
  }
  try {
    const resp = await fetch(`${API}/chat-db`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : "Sorry, I couldn't answer that."
      return { text: detail, properties: [] }
    }
    return { text: (data.response || "Sorry, I couldn't answer that.").trim(), properties: data.properties || [] }
  } catch {
    return { text: 'Could not reach the assistant. Check your connection and try again.', properties: [] }
  }
}

export default function DbChatbot() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
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
    if (!value || loading) return
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
      title="Ask about listings"
      subtitle="Answers come from your agency's listings. Property names open their page."
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
          disabled={loading}
          placeholder="Ask about listings, prices, or talking points for a call"
        />
      }
    >
      {messages.length === 0 && (
        <Starters
          title="What are you looking for?"
          description="Ask in plain words. Every figure comes from your listings, never invented."
          prompts={STARTERS}
          onPick={send}
        />
      )}

      {messages.map((m, idx) => {
        const isUser = m.from === 'user'
        const html = !isUser && looksLikeHtml(m.text)
        const linkedInText = html && /href\s*=\s*["']\/property\//i.test(m.text)
        return (
          <MessageRow key={m.time || idx} who={m.from}>
            <MessageSurface who={m.from}>
              {html ? (
                <HtmlReply html={m.text} />
              ) : (
                <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-line', lineHeight: 1.55 }}>{m.text}</Typography>
              )}
            </MessageSurface>

            {!isUser && !linkedInText && Array.isArray(m.properties) && m.properties.length > 0 && (
              <Box className="chat-html" sx={{ mt: `${SPACE.md}px`, display: 'flex', flexWrap: 'wrap', gap: `${SPACE.lg}px` }}>
                {m.properties
                  .filter((p) => /^\d+$/.test(String(p?.id ?? '')))
                  .map((p) => (
                    <HtmlReply key={p.id} html={`<a href="/property/${p.id}">View property ${p.id}</a>`} />
                  ))}
              </Box>
            )}
          </MessageRow>
        )
      })}

      {loading && <ThinkingRow label="Looking through your listings…" />}
    </ChatFrame>
  )
}
