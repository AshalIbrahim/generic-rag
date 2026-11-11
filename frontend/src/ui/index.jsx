/**
 * Shared layout primitives.
 *
 * Every page used to build its own header, panel and stat card, so titles,
 * padding and panel corners differed on every screen. These are the pieces
 * pages compose instead; spacing comes from the Fibonacci scale in theme.js.
 */
import React from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import { SPACE, palette } from '../theme'

/**
 * The top of every page: what this screen is, one line on what it is for, and
 * the actions that belong to it.
 */
export function PageHeader({ title, description, actions, children }) {
  return (
    <Box sx={{ mb: `${SPACE.xl}px` }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={`${SPACE.lg}px`}
        sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" component="h1">
            {title}
          </Typography>
          {description && (
            <Typography
              variant="body2"
              color="text.secondary"
              // Roughly 61.8% of a comfortable reading column, so the line
              // breaks before it gets tiring.
              sx={{ mt: `${SPACE.sm}px`, maxWidth: '58ch' }}
            >
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={`${SPACE.md}px`} sx={{ flexShrink: 0, alignItems: 'center' }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children}
    </Box>
  )
}

/**
 * A bordered panel. `padded` for prose and forms; leave it off for a table,
 * which brings its own cell padding.
 */
export function Section({
  title,
  description,
  actions,
  padded = false,
  children,
  sx,
  ...rest
}) {
  const hasHeader = Boolean(title || actions || description)
  return (
    <Paper
      variant="outlined"
      sx={{ overflow: 'hidden', borderColor: palette.border, ...sx }}
      {...rest}
    >
      {hasHeader && (
        <Box
          sx={{
            px: `${SPACE.xl}px`,
            py: `${SPACE.lg}px`,
            display: 'flex',
            alignItems: { xs: 'stretch', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: `${SPACE.md}px`,
            justifyContent: 'space-between',
            borderBottom: children ? `1px solid ${palette.border}` : 'none',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography variant="h3" component="h2">
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: `${SPACE.xxs}px`, maxWidth: '64ch' }}>
                {description}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack
              direction="row"
              spacing={`${SPACE.md}px`}
              sx={{ flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', rowGap: `${SPACE.md}px` }}
            >
              {actions}
            </Stack>
          )}
        </Box>
      )}
      {children && <Box sx={padded ? { p: `${SPACE.xl}px` } : undefined}>{children}</Box>}
    </Paper>
  )
}

/**
 * A row of figures in ONE bordered panel, divided by hairlines.
 *
 * Deliberately not four floating cards: separate cards make four boxes compete
 * for attention, while one panel reads as a single summary line.
 */
export function StatRow({ children }) {
  const items = React.Children.toArray(children)
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${items.length}, 1fr)` },
        borderColor: palette.border,
        overflow: 'hidden',
      }}
    >
      {items.map((child, i) => (
        <Box
          key={i}
          sx={{
            p: `${SPACE.xl}px`,
            borderLeft: { md: i === 0 ? 'none' : `1px solid ${palette.border}` },
            // On two-column mobile, borders follow the grid instead.
            borderTop: { xs: i > 1 ? `1px solid ${palette.border}` : 'none', md: 'none' },
            borderLeftWidth: { xs: i % 2 === 1 ? 1 : 0, md: i === 0 ? 0 : 1 },
            borderLeftStyle: 'solid',
            borderLeftColor: palette.border,
          }}
        >
          {child}
        </Box>
      ))}
    </Paper>
  )
}

/** One figure. Label above, value large, optional supporting line beneath. */
export function Stat({ label, value, hint, tone }) {
  const toneColor =
    tone === 'positive' ? 'success.main' : tone === 'negative' ? 'error.main' : 'text.primary'
  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block' }}>
        {label}
      </Typography>
      <Typography
        className="tnum"
        sx={{ fontSize: 21, fontWeight: 620, letterSpacing: '-0.02em', color: toneColor, mt: `${SPACE.xs}px` }}
      >
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: `${SPACE.xxs}px` }}>
          {hint}
        </Typography>
      )}
    </Box>
  )
}

/**
 * One status vocabulary for the whole app.
 *
 * Leads, follow-ups and deals each had their own colour map, so "pending"
 * could be grey on one screen and amber on another.
 */
const STATUS_TONES = {
  // leads
  new: { label: 'New', bg: '#F1F5F9', fg: '#334155', bd: '#E2E8F0' },
  contacted: { label: 'Contacted', bg: '#F0F9FF', fg: '#0369A1', bd: '#BAE6FD' },
  viewing: { label: 'Viewing', bg: '#F0F9FF', fg: '#0369A1', bd: '#BAE6FD' },
  negotiation: { label: 'Negotiation', bg: '#FFFBEB', fg: '#B45309', bd: '#FDE68A' },
  won: { label: 'Won', bg: '#F0FDF4', fg: '#15803D', bd: '#BBF7D0' },
  lost: { label: 'Lost', bg: '#FEF2F2', fg: '#B91C1C', bd: '#FECACA' },
  // follow-ups and deals
  pending: { label: 'Pending', bg: '#FFFBEB', fg: '#B45309', bd: '#FDE68A' },
  overdue: { label: 'Overdue', bg: '#FEF2F2', fg: '#B91C1C', bd: '#FECACA' },
  done: { label: 'Done', bg: '#F0FDF4', fg: '#15803D', bd: '#BBF7D0' },
  paid: { label: 'Paid', bg: '#F0FDF4', fg: '#15803D', bd: '#BBF7D0' },
  cancelled: { label: 'Cancelled', bg: '#F6F5F4', fg: '#78716C', bd: '#E7E5E4' },
  // purposes
  'for sale': { label: 'For Sale', bg: '#F0FDFA', fg: '#0F766E', bd: '#99F6E4' },
  'for rent': { label: 'For Rent', bg: '#FAF5FF', fg: '#7E22CE', bd: '#E9D5FF' },
}

export function StatusChip({ status, label, size = 'small' }) {
  const key = String(status || '').trim().toLowerCase()
  const tone = STATUS_TONES[key] || { label: status || '—', bg: '#F6F5F4', fg: '#57534E', bd: '#E7E5E4' }
  return (
    <Chip
      size={size}
      label={label || tone.label}
      sx={{
        bgcolor: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.bd}`,
        '& .MuiChip-label': { px: `${SPACE.sm}px` },
      }}
    />
  )
}

/** Shown in place of an empty table or list. */
export function EmptyState({ title, description, action, compact = false }) {
  return (
    <Box sx={{ textAlign: 'center', px: `${SPACE.xl}px`, py: compact ? `${SPACE.xl}px` : `${SPACE.xxl}px` }}>
      <Typography variant="h4" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: `${SPACE.sm}px`, mx: 'auto', maxWidth: '44ch' }}
        >
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: `${SPACE.lg}px` }}>{action}</Box>}
    </Box>
  )
}

/** Centred spinner for a first load. */
export function Loading({ label = 'Loading', py = SPACE.xxl }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${SPACE.md}px`, py: `${py}px` }}>
      <CircularProgress size={16} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
}

/**
 * A horizontal strip of controls above a table. Wraps on narrow screens rather
 * than overflowing, and keeps a consistent gap between fields.
 */
export function Toolbar({ children, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${SPACE.md}px`,
        px: `${SPACE.xl}px`,
        py: `${SPACE.lg}px`,
        borderBottom: `1px solid ${palette.border}`,
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

/** Label / value pair, for detail panels. */
export function FieldRow({ label, value, align = 'row' }) {
  if (align === 'column') {
    return (
      <Box>
        <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body1" sx={{ mt: `${SPACE.xxs}px` }}>
          {value ?? '—'}
        </Typography>
      </Box>
    )
  }
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: `${SPACE.lg}px`,
        py: `${SPACE.md}px`,
        borderBottom: `1px solid ${palette.border}`,
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  )
}
