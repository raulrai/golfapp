'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/', label: 'Home', icon: '⛳' },
  { href: '/play', label: 'Play', icon: '🏌️' },
  { href: '/handicaps', label: 'Handicaps', icon: '📊' },
  { href: '/leaderboard', label: 'Money', icon: '🏆' },
  { href: '/history', label: 'History', icon: '📋' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: 'white',
      borderTop: '1px solid #e5e7eb',
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
            color: active ? '#1B4332' : '#9ca3af',
            fontSize: 10,
            fontWeight: active ? 700 : 400,
            gap: 2,
          }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{n.icon}</span>
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
