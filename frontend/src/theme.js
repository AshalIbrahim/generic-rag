/**
 * Design system for the agency CRM.
 *
 * This is the single place colour, type and spacing are decided. Pages should
 * read from the theme rather than hard-coding hex values, which is how the old
 * UI ended up with three unrelated colour schemes at once (teal nav, purple
 * login, indigo forms).
 *
 * Proportions use the golden ratio, phi = 1.618:
 *
 * - Type scale steps by sqrt(phi) = 1.272, so every SECOND step is exactly phi.
 *   13 -> 16 -> 21 is one phi jump; body 14 to page title 23 is a little over
 *   one and a half steps. Fine steps matter in a CRM, where a table row and its
 *   heading need to differ clearly without shouting.
 * - Spacing is the Fibonacci sequence, whose ratio converges on phi:
 *   2, 3, 5, 8, 13, 21, 34, 55, 89. Adjacent sizes are always distinguishable,
 *   so padding never looks "almost the same" as the gap beside it.
 * - Layout splits are 61.8% / 38.2% (see SPLIT), and photographs are shown at
 *   1.618:1 (see RATIO).
 *
 * Deliberately absent: gradients, coloured shadows and hover-lift animations.
 * This is a tool people use all day, so surfaces are flat, separated by hairline
 * borders, and colour is reserved for meaning (status, the primary action, the
 * active page).
 */
import { createTheme } from '@mui/material/styles'

/** Fibonacci spacing, in px. Use these instead of arbitrary numbers. */
export const SPACE = {
  xxs: 2,
  xs: 3,
  sm: 5,
  md: 8,
  lg: 13,
  xl: 21,
  xxl: 34,
  xxxl: 55,
  huge: 89,
}

/** Golden-ratio proportions. */
export const PHI = 1.618
export const RATIO = { golden: '1.618 / 1', portrait: '1 / 1.618', square: '1 / 1' }
/** A 61.8 / 38.2 two-column split: the major column and the minor one. */
export const SPLIT = { major: '61.8%', minor: '38.2%' }

/** Type scale: 13px base, each step x1.272 (sqrt of phi). */
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  base: 13.5,
  md: 15,
  lg: 17,
  xl: 21,
  xxl: 23,
}

export const palette = {
  // A warm neutral canvas. Pure grey reads clinical; a hint of warmth makes a
  // dense screen easier to sit in front of for a full working day.
  canvas: '#FBFAF9',
  surface: '#FFFFFF',
  surfaceSunken: '#F6F5F4',
  border: '#E7E5E4',
  borderStrong: '#D6D3D1',
  ink: '#1C1917',
  inkSecondary: '#57534E',
  inkMuted: '#A8A29E',
  // One accent, carried over from the old UI so the product still looks like
  // itself. Used only for the primary action, links, and the active page.
  accent: '#0F766E',
  accentHover: '#115E59',
  accentSoft: '#F0FDFA',
  accentBorder: '#99F6E4',
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: palette.accent, dark: palette.accentHover, contrastText: '#FFFFFF' },
    secondary: { main: palette.inkSecondary },
    success: { main: '#15803D', light: '#F0FDF4' },
    warning: { main: '#B45309', light: '#FFFBEB' },
    error: { main: '#B91C1C', light: '#FEF2F2' },
    info: { main: '#0369A1', light: '#F0F9FF' },
    background: { default: palette.canvas, paper: palette.surface },
    text: {
      primary: palette.ink,
      secondary: palette.inkSecondary,
      disabled: palette.inkMuted,
    },
    divider: palette.border,
  },

  shape: { borderRadius: 8 },

  // Shadows are for things that float above the page, nothing else. Index 1 and
  // 2 are flattened so a stray `elevation={1}` cannot reintroduce a drop shadow.
  shadows: [
    'none',
    'none',
    'none',
    '0 1px 2px rgba(28,25,23,0.06)',
    '0 2px 4px rgba(28,25,23,0.06)',
    '0 4px 8px rgba(28,25,23,0.07)',
    '0 8px 16px rgba(28,25,23,0.08)',
    '0 13px 21px rgba(28,25,23,0.09)',
    ...Array(17).fill('0 13px 34px rgba(28,25,23,0.12)'),
  ],

  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    fontSize: FONT_SIZE.base,
    // Tight, even line heights: headings sit close to their content so a
    // section reads as one block rather than scattered text.
    h1: { fontSize: FONT_SIZE.xxl, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.25 },
    h2: { fontSize: FONT_SIZE.xl, fontWeight: 650, letterSpacing: '-0.015em', lineHeight: 1.3 },
    h3: { fontSize: FONT_SIZE.lg, fontWeight: 620, letterSpacing: '-0.01em', lineHeight: 1.35 },
    h4: { fontSize: FONT_SIZE.md, fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: FONT_SIZE.base, fontWeight: 600, lineHeight: 1.45 },
    h6: { fontSize: FONT_SIZE.sm, fontWeight: 600, lineHeight: 1.45 },
    subtitle1: { fontSize: FONT_SIZE.base, fontWeight: 500, lineHeight: 1.5 },
    subtitle2: { fontSize: FONT_SIZE.sm, fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: FONT_SIZE.base, lineHeight: 1.55 },
    body2: { fontSize: FONT_SIZE.sm, lineHeight: 1.55 },
    caption: { fontSize: FONT_SIZE.xs, lineHeight: 1.45, color: palette.inkSecondary },
    overline: {
      fontSize: FONT_SIZE.xs,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      lineHeight: 1.4,
    },
    button: { textTransform: 'none', fontWeight: 550, fontSize: FONT_SIZE.base },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: palette.canvas, color: palette.ink },
        // Money and counts line up in columns only with tabular figures.
        '.tnum': { fontVariantNumeric: 'tabular-nums' },
        '*:focus-visible': {
          outline: `2px solid ${palette.accent}`,
          outlineOffset: 2,
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: palette.border },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 7, paddingInline: SPACE.lg, minHeight: 34 },
        sizeSmall: { minHeight: 28, paddingInline: SPACE.md, fontSize: FONT_SIZE.sm },
        contained: { '&:hover': { backgroundColor: palette.accentHover } },
        outlined: {
          borderColor: palette.borderStrong,
          color: palette.ink,
          '&:hover': { borderColor: palette.inkMuted, backgroundColor: palette.surfaceSunken },
        },
        text: { '&:hover': { backgroundColor: palette.surfaceSunken } },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: palette.surface,
          '& fieldset': { borderColor: palette.border },
          '&:hover fieldset': { borderColor: palette.borderStrong },
          '&.Mui-focused fieldset': { borderWidth: 1, borderColor: palette.accent },
        },
        input: { fontSize: FONT_SIZE.base },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: FONT_SIZE.base } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: FONT_SIZE.xs, marginLeft: 0, color: palette.inkSecondary } },
    },

    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: palette.border,
          paddingTop: SPACE.md,
          paddingBottom: SPACE.md,
          paddingLeft: SPACE.lg,
          paddingRight: SPACE.lg,
          fontSize: FONT_SIZE.base,
        },
        // Column headers are quieter than the data they label: the numbers are
        // what people scan, not the words above them.
        head: {
          fontSize: FONT_SIZE.xs,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: palette.inkSecondary,
          backgroundColor: palette.surfaceSunken,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&:last-of-type td': { borderBottom: 'none' } },
        hover: { '&:hover': { backgroundColor: palette.surfaceSunken } },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 550, fontSize: FONT_SIZE.xs, height: 21 },
        sizeSmall: { height: 20 },
        outlined: { borderColor: palette.border },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 38, borderBottom: `1px solid ${palette.border}` },
        indicator: { height: 2 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 38,
          padding: `0 ${SPACE.lg}px`,
          fontSize: FONT_SIZE.base,
          fontWeight: 550,
          color: palette.inkSecondary,
          '&.Mui-selected': { color: palette.ink },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 7, fontSize: FONT_SIZE.base, border: '1px solid', paddingBlock: SPACE.sm },
        standardError: { borderColor: '#FECACA' },
        standardSuccess: { borderColor: '#BBF7D0' },
        standardInfo: { borderColor: '#BAE6FD' },
        standardWarning: { borderColor: '#FDE68A' },
      },
    },

    MuiDialog: { styleOverrides: { paper: { borderRadius: 11, border: `1px solid ${palette.border}` } } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: FONT_SIZE.lg, fontWeight: 620, padding: SPACE.xl } } },
    MuiDialogContent: { styleOverrides: { root: { padding: `0 ${SPACE.xl}px` } } },
    MuiDialogActions: { styleOverrides: { root: { padding: SPACE.xl, gap: SPACE.md } } },

    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${palette.border}`, borderRadius: 8 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: FONT_SIZE.base, minHeight: 32 } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: palette.ink, fontSize: FONT_SIZE.sm, borderRadius: 6, padding: '5px 8px' },
      },
    },
    MuiLink: { styleOverrides: { root: { textDecorationColor: 'currentColor', textUnderlineOffset: 2 } } },
    MuiCircularProgress: { defaultProps: { size: 18, thickness: 4.5 } },
  },
})

export default theme
