/**
 * Shared formatting. Every screen shows money, areas and dates, and they were
 * each formatting them differently, so a price could read "PKR 15,000,000" on
 * one page and "15000000" on the next.
 */

const PKR = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

const PLAIN = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 })

const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))

/** Exact amount, for tables and anywhere a figure is checked: "PKR 15,000,000". */
export function formatPKR(value) {
  if (!isNum(value)) return '—'
  return PKR.format(Number(value))
}

/**
 * Readable amount, for headlines and tiles: "1.5 crore", "45 lakh".
 *
 * Prices here are quoted in crore and lakh, not millions, so this is what an
 * agent reads out on a call. Exact figures still use formatPKR.
 */
export function formatPKRCompact(value) {
  if (!isNum(value)) return '—'
  const n = Number(value)
  const abs = Math.abs(n)
  const trim = (x) => String(Number(x.toFixed(2)))
  if (abs >= 1e7) return `${trim(n / 1e7)} crore`
  if (abs >= 1e5) return `${trim(n / 1e5)} lakh`
  if (abs >= 1e3) return `${trim(n / 1e3)}k`
  return PLAIN.format(n)
}

/** Plain count. */
export function formatNumber(value) {
  if (!isNum(value)) return '—'
  return PLAIN.format(Number(value))
}

/**
 * Covered area with no unit.
 *
 * The listings table stores a bare number with no unit recorded, so naming one
 * would be inventing it -- the backend prompts forbid it for the same reason.
 */
export function formatArea(value) {
  if (!isNum(value)) return '—'
  return PLAIN.format(Number(value))
}

/** Price per unit of area, or null when either side is missing. */
export function pricePerArea(price, area) {
  if (!isNum(price) || !isNum(area) || Number(area) === 0) return null
  return Number(price) / Number(area)
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/**
 * How a due date reads to someone working a list: "Overdue by 2 days",
 * "Today", "Tomorrow", "in 5 days". Clearer than a bare timestamp when the
 * whole point is what needs doing next.
 */
export function formatDue(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `Overdue by ${Math.abs(days)} days`
  if (days <= 14) return `in ${days} days`
  return formatDate(value)
}

/** "For Sale" / "For Rent", however the row happens to spell it. */
export function purposeLabel(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'sale' || v === 'for sale') return 'For Sale'
  if (v === 'rent' || v === 'for rent') return 'For Rent'
  return value || '—'
}

/** Initials for an avatar, from a name or an email address. */
export function initials(nameOrEmail) {
  const s = String(nameOrEmail || '').trim()
  if (!s) return '?'
  const name = s.includes('@') ? s.split('@')[0] : s
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
