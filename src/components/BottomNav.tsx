'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/', label: 'Home', icon: '⛳' },
  { href: '/play', label: 'Play', icon: '🏌️' },
  { href: '/handicaps', label: 'Handicaps', icon: '📊' },
  { href: '/leaderboard', label: 'Money', icon: '🏆' },
  { href: '/history', label: 'History', icon: '📋' },
  { href: '/chat', label: 'Ask', icon: '💬' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 40,
      background: 'rgba(8, 24, 15, 0.96)', backdropFilter: 'blur(8px)',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {NAV.map(n => {
        const active = path === n.href
        return (
          <Link key={n.href} href={n.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '10px 0 8px',
            textDecoration: 'none',
            color: active ? 'var(--gold)' : 'var(--muted)',
            fontSize: 10,
            fontWeight: active ? 700 : 400,
            gap: 3,
          }}>
            <span style={{ fontSize: 21, lineHeight: 1, filter: active ? 'none' : 'grayscale(0.4) opacity(0.8)' }}>{n.icon}</span>
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
