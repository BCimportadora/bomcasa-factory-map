import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Factory, Users, Anchor, ShieldCheck, LogOut, Menu, X, Settings } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { initials, fullName, roleKey } from '../../lib/constants'
import LanguageSwitcher from './LanguageSwitcher'
import LanguageSync from './LanguageSync'
import logo from '../../assets/logo.png'

/**
 * Application shell: a persistent sidebar on large screens, a slide-over drawer
 * on small ones. Admin-only entries are hidden here for clarity, but the routes
 * and the database enforce the same rules independently.
 */
export default function AppLayout({ children }) {
  const { profile, isAdmin, signOut } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const links = [
    { to: '/', label: t('nav.factories'), icon: Factory, end: true },
    { to: '/people', label: t('nav.people'), icon: Users },
    { to: '/ports', label: t('nav.ports'), icon: Anchor },
  ]

  const sidebar = (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src={logo} alt="" className="h-7 w-auto" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">{t('common.appName')}</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <div className="pt-5">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t('nav.administration')}
            </p>
            <NavLink
              to="/admin/accounts"
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <ShieldCheck size={18} strokeWidth={1.75} />
              {t('nav.manageAccounts')}
            </NavLink>
          </div>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <LanguageSwitcher className="mb-3" />

        <NavLink
          to="/account"
          className={({ isActive }) => `nav-link mb-1 ${isActive ? 'nav-link-active' : ''}`}
        >
          <Settings size={18} strokeWidth={1.75} />
          {t('nav.settings')}
        </NavLink>

        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <NavLink to="/account" className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-[12px] font-semibold text-accent">
              {initials(profile)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{fullName(profile) || '—'}</p>
              <p className="truncate text-[12px] text-muted">
                {profile?.role ? t(roleKey(profile.role)) : ''}
              </p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={signOut}
            title={t('common.signOut')}
            aria-label={t('common.signOut')}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-danger"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full bg-canvas">
      <LanguageSync />

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-line lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[3000] lg:hidden">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[82vw] border-r border-line shadow-overlay">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <img src={logo} alt="" className="h-6 w-auto" />
          <span className="text-[15px] font-semibold">{t('common.appName')}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
