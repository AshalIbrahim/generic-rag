/**
 * The frame every page sits in: a sidebar on desktop, a slim bar with a drawer
 * on mobile.
 *
 * It replaces the old NavBar, which put nine untitled buttons in one row of an
 * AppBar -- they overflowed on a laptop, gave no sign of which page you were
 * on, and mixed listing work with admin work. Here the pages are grouped by the
 * job they belong to, the current one is marked, and anything the signed-in
 * role cannot use is not shown at all.
 *
 * There is no topbar on desktop: each page already states its own title through
 * PageHeader, so a second bar repeating it would only cost vertical space.
 */
import React, { useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

import HomeWorkOutlined from '@mui/icons-material/HomeWorkOutlined'
import PlaceOutlined from '@mui/icons-material/PlaceOutlined'
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined'
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined'
import InsightsOutlined from '@mui/icons-material/InsightsOutlined'
import ForumOutlined from '@mui/icons-material/ForumOutlined'
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined'
import AddHomeWorkOutlined from '@mui/icons-material/AddHomeWorkOutlined'
import GroupAddOutlined from '@mui/icons-material/GroupAddOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import MenuIcon from '@mui/icons-material/Menu'

import { SPACE, palette } from '../theme'
import { initials } from '../ui/format'

/** 233px: the next Fibonacci number up, in step with the spacing scale. */
const SIDEBAR_WIDTH = 233

/**
 * Pages grouped by the job they belong to. `roles` limits an entry to those
 * roles; the server enforces the same rules, this only avoids offering a page
 * that would refuse the person on arrival.
 */
const NAV = [
  {
    group: 'Properties',
    items: [
      { to: '/', label: 'Listings', icon: HomeWorkOutlined, exact: true },
      { to: '/locations', label: 'Locations', icon: PlaceOutlined },
      { to: '/add-listing', label: 'Add a listing', icon: AddHomeWorkOutlined, roles: ['agent', 'owner'] },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { to: '/leads', label: 'Leads & follow-ups', icon: PeopleAltOutlined },
      { to: '/sales', label: 'Sales & commissions', icon: ReceiptLongOutlined },
      { to: '/performance', label: 'Team performance', icon: InsightsOutlined },
    ],
  },
  {
    group: 'Assistant',
    items: [
      { to: '/chat-db', label: 'Ask about listings', icon: ForumOutlined },
      { to: '/chatbot', label: 'Describe & find', icon: TravelExploreOutlined },
    ],
  },
  {
    group: 'Agency',
    items: [{ to: '/add-agent', label: 'Team accounts', icon: GroupAddOutlined, roles: ['owner', 'sysadmin'] }],
  },
]

const ROLE_LABEL = { owner: 'Owner', agent: 'Agent', sysadmin: 'Sysadmin' }

function isActive(pathname, item) {
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavItem({ item, active, onNavigate }) {
  const Icon = item.icon
  return (
    <Box
      component={RouterLink}
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: `${SPACE.lg}px`,
        px: `${SPACE.lg}px`,
        py: `${SPACE.md}px`,
        borderRadius: '7px',
        textDecoration: 'none',
        color: active ? palette.accent : palette.inkSecondary,
        backgroundColor: active ? palette.accentSoft : 'transparent',
        fontWeight: active ? 600 : 500,
        fontSize: 13.5,
        lineHeight: 1.4,
        transition: 'background-color .12s ease, color .12s ease',
        '&:hover': {
          backgroundColor: active ? palette.accentSoft : palette.surfaceSunken,
          color: active ? palette.accent : palette.ink,
        },
      }}
    >
      <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </Box>
    </Box>
  )
}

function SidebarContent({ user, onLogout, onNavigate }) {
  const { pathname } = useLocation()
  const role = user?.role
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0)

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: palette.surface }}>
      {/* Brand */}
      <Box
        sx={{
          px: `${SPACE.xl}px`,
          py: `${SPACE.xl}px`,
          display: 'flex',
          alignItems: 'center',
          gap: `${SPACE.lg}px`,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 26,
            height: 26,
            borderRadius: '7px',
            bgcolor: palette.accent,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          Z
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 620, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Zameen
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Agency workspace
          </Typography>
        </Box>
      </Box>

      {/* Navigation */}
      <Box
        component="nav"
        aria-label="Main"
        sx={{ flex: 1, overflowY: 'auto', px: `${SPACE.lg}px`, pb: `${SPACE.lg}px` }}
      >
        {groups.map((group, gi) => (
          <Box key={group.group} sx={{ mt: gi === 0 ? 0 : `${SPACE.xl}px` }}>
            <Typography
              variant="overline"
              sx={{ display: 'block', px: `${SPACE.lg}px`, mb: `${SPACE.sm}px`, color: palette.inkMuted }}
            >
              {group.group}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${SPACE.xxs}px` }}>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  active={isActive(pathname, item)}
                  onNavigate={onNavigate}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Who is signed in */}
      <Divider />
      <Box sx={{ p: `${SPACE.lg}px`, display: 'flex', alignItems: 'center', gap: `${SPACE.lg}px` }}>
        <Avatar
          sx={{
            width: 29,
            height: 29,
            fontSize: 11,
            fontWeight: 620,
            bgcolor: palette.accentSoft,
            color: palette.accent,
            border: `1px solid ${palette.accentBorder}`,
          }}
        >
          {initials(user?.email)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Tooltip title={user?.email || ''} placement="top">
            <Typography
              sx={{
                fontSize: 12.5,
                fontWeight: 550,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email || 'Signed in'}
            </Typography>
          </Tooltip>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ROLE_LABEL[role] || role || '—'}
          </Typography>
        </Box>
        <Tooltip title="Sign out">
          <IconButton size="small" onClick={onLogout} aria-label="Sign out">
            <LogoutOutlined sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )
}

export default function AppShell({ user, onLogout, children }) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [open, setOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: palette.canvas }}>
      {isDesktop ? (
        <Box
          component="aside"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            borderRight: `1px solid ${palette.border}`,
          }}
        >
          <SidebarContent user={user} onLogout={onLogout} />
        </Box>
      ) : (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: SIDEBAR_WIDTH, borderRight: `1px solid ${palette.border}` } }}
        >
          <SidebarContent user={user} onLogout={onLogout} onNavigate={() => setOpen(false)} />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          ml: { md: `${SIDEBAR_WIDTH}px` },
        }}
      >
        {!isDesktop && (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: `${SPACE.lg}px`,
              px: `${SPACE.lg}px`,
              py: `${SPACE.md}px`,
              bgcolor: palette.surface,
              borderBottom: `1px solid ${palette.border}`,
            }}
          >
            <IconButton size="small" onClick={() => setOpen(true)} aria-label="Open menu">
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <Typography sx={{ fontSize: 14, fontWeight: 620 }}>Zameen</Typography>
          </Box>
        )}

        <Box
          sx={{
            maxWidth: 1597, // Fibonacci again; wide enough for the big tables
            mx: 'auto',
            px: { xs: `${SPACE.lg}px`, sm: `${SPACE.xl}px`, lg: `${SPACE.xxl}px` },
            py: { xs: `${SPACE.xl}px`, lg: `${SPACE.xxl}px` },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
