import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  sectionDescriptionKey,
  sectionGroupKey,
  sectionNameKey,
  sectionsByGroup,
} from '../lib/sections'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'

/**
 * The main menu — the first screen after signing in.
 *
 * Every section of the platform is reachable from here, including the ones
 * still being built, so the shape of the product is visible from day one.
 */
function SectionTile({ section, delay }) {
  const { t } = useI18n()
  const Icon = section.icon

  return (
    <div className="tile-enter" style={{ animationDelay: `${delay}ms` }}>
      <Link to={section.path} className="tile group">
        <div className="flex w-full items-start gap-4">
          <div className={`tile-icon flex-shrink-0 group-hover:scale-105 ${section.tone}`}>
            <Icon size={21} strokeWidth={1.75} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
              {t(sectionNameKey(section.id))}
            </h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              {t(sectionDescriptionKey(section.id))}
            </p>
          </div>

          <ChevronRight
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="mt-0.5 flex-shrink-0 text-muted/40 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-muted"
          />
        </div>

        {!section.ready && (
          <div className="mt-auto pt-3">
            <span className="badge-neutral">{t('home.comingSoon')}</span>
          </div>
        )}
      </Link>
    </div>
  )
}

export default function HomePage() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const groups = sectionsByGroup()

  const firstName = profile?.first_name?.trim()

  // A single counter across every group so the tiles fade in reading order
  // rather than all four groups starting at once.
  let tileIndex = -1

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="tile-enter">
          <h1 className="page-title">
            {firstName ? t('home.greetingNamed', { name: firstName }) : t('home.greeting')}
          </h1>
          <p className="page-subtitle">{t('home.subtitle')}</p>
        </header>

        <div className="mt-8 space-y-8 sm:mt-10 sm:space-y-10">
          {groups.map(({ group, sections }) => (
            <section key={group}>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t(sectionGroupKey(group))}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                {sections.map((section) => {
                  tileIndex += 1
                  return (
                    <SectionTile key={section.id} section={section} delay={40 + tileIndex * 45} />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
