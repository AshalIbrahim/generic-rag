/**
 * The frame both assistants share: header, scrolling transcript, composer.
 *
 * There are two chat surfaces in the product -- one answers from the listings
 * table, the other from the semantic index -- and they had drifted into
 * different headers, bubbles and send buttons. Keeping the chrome here means
 * they stay the same thing with two brains, and only the message rendering
 * differs.
 */
import React, { forwardRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendOutlined from '@mui/icons-material/SendOutlined'

import { SPACE, palette } from '../theme'

/** Width the transcript is capped at, so long replies stay readable. */
export const TRANSCRIPT_WIDTH = 987 // Fibonacci

export function ChatAvatar({ who }) {
  const isUser = who === 'user'
  return (
    <Box
      aria-hidden
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: 10,
        fontWeight: 620,
        bgcolor: isUser ? palette.surfaceSunken : palette.accentSoft,
        color: isUser ? palette.inkSecondary : palette.accent,
        border: `1px solid ${isUser ? palette.border : palette.accentBorder}`,
      }}
    >
      {isUser ? 'You' : 'Z'}
    </Box>
  )
}

/** The surface a message sits on. Users get a tight accent bubble; the
 *  assistant gets a wide quiet one, since its answers are usually lists. */
export function MessageSurface({ who, children }) {
  const isUser = who === 'user'
  return (
    <Box
      sx={
        isUser
          ? {
              px: `${SPACE.lg}px`,
              py: `${SPACE.md}px`,
              borderRadius: '10px',
              bgcolor: palette.accentSoft,
              border: `1px solid ${palette.accentBorder}`,
            }
          : {
              px: `${SPACE.xl}px`,
              py: `${SPACE.lg}px`,
              borderRadius: '10px',
              bgcolor: palette.surfaceSunken,
              border: `1px solid ${palette.border}`,
            }
      }
    >
      {children}
    </Box>
  )
}

/** One row of the transcript: avatar plus message, sided by sender. */
export function MessageRow({ who, children }) {
  const isUser = who === 'user'
  return (
    <Box sx={{ display: 'flex', gap: `${SPACE.lg}px`, flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
      <ChatAvatar who={who} />
      <Box sx={{ minWidth: 0, maxWidth: isUser ? '72%' : '100%', flex: isUser ? '0 1 auto' : 1 }}>{children}</Box>
    </Box>
  )
}

export function ThinkingRow({ label = 'Thinking…' }) {
  return (
    <Box sx={{ display: 'flex', gap: `${SPACE.lg}px`, alignItems: 'center' }}>
      <ChatAvatar who="bot" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: `${SPACE.md}px`, color: 'text.secondary' }}>
        <CircularProgress size={13} />
        <Typography variant="body2">{label}</Typography>
      </Box>
    </Box>
  )
}

/** Prompts offered when the transcript is empty. */
export function Starters({ title, description, prompts, onPick }) {
  return (
    <Box sx={{ maxWidth: 610, mx: 'auto', textAlign: 'center', py: `${SPACE.xl}px` }}>
      <Typography variant="h3">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.sm}px`, mb: `${SPACE.xl}px` }}>
        {description}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.md}px` }}>
        {prompts.map((p) => (
          <Box
            key={p}
            component="button"
            type="button"
            onClick={() => onPick(p)}
            sx={{
              appearance: 'none',
              font: 'inherit',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
              px: `${SPACE.lg}px`,
              py: `${SPACE.lg}px`,
              border: `1px solid ${palette.border}`,
              borderRadius: '7px',
              bgcolor: palette.surface,
              color: palette.inkSecondary,
              '&:hover': { borderColor: palette.accentBorder, bgcolor: palette.accentSoft, color: palette.accent },
            }}
          >
            {p}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function Composer({ value, onChange, onSend, disabled, placeholder }) {
  return (
    <Box sx={{ p: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` }, borderTop: `1px solid ${palette.border}` }}>
      <Box sx={{ display: 'flex', gap: `${SPACE.md}px`, alignItems: 'flex-end', maxWidth: TRANSCRIPT_WIDTH, mx: 'auto' }}>
        <TextField
          fullWidth
          multiline
          maxRows={5}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          disabled={disabled}
        />
        <IconButton
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          sx={{
            width: 34,
            height: 34,
            borderRadius: '7px',
            bgcolor: palette.accent,
            color: '#fff',
            '&:hover': { bgcolor: palette.accentHover },
            '&.Mui-disabled': { bgcolor: palette.border, color: palette.inkMuted },
          }}
        >
          <SendOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  )
}

/**
 * The outer frame. `ref` is forwarded to the scrolling transcript so the page
 * can keep it pinned to the newest message.
 */
const ChatFrame = forwardRef(function ChatFrame(
  { title, subtitle, onClear, showClear, children, composer, overlay },
  transcriptRef
) {
  return (
    <Box
      sx={{
        position: 'relative',
        border: `1px solid ${palette.border}`,
        borderRadius: '8px',
        bgcolor: palette.surface,
        display: 'flex',
        flexDirection: 'column',
        // Fills the shell's content area without the page itself scrolling.
        height: 'calc(100vh - 144px)',
        minHeight: 377,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: `${SPACE.xl}px`,
          py: `${SPACE.lg}px`,
          borderBottom: `1px solid ${palette.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: `${SPACE.lg}px`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h3" component="h1">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        {showClear && (
          <Button size="small" variant="text" sx={{ color: 'text.secondary' }} onClick={onClear}>
            Clear chat
          </Button>
        )}
      </Box>

      <Box
        ref={transcriptRef}
        sx={{ flex: 1, overflowY: 'auto', px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px` }, py: `${SPACE.xl}px` }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.xl}px`, maxWidth: TRANSCRIPT_WIDTH, mx: 'auto' }}>
          {children}
        </Box>
      </Box>

      {composer}

      {overlay}
    </Box>
  )
})

export default ChatFrame
