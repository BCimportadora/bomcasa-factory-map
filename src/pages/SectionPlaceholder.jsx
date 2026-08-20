import { Link } from 'react-router-dom'
import { ArrowLeft, Hammer } from 'lucide-react'
import { getSection, sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import { useI18n } from '../i18n'

/**
 * Stand-in for a section whose route exists but whose feature is still being
 * built. It states plainly that there is nothing here yet rather than showing
 * an empty table that looks broken.
 *
 * When a section is built, point its route at the real page and flip `ready`
 * in lib/sections.js.
 */
export default function SectionPlaceholder({ sectionId }) {
  const { t } = useI18n()
  const section = getSection(sectionId)
  const Icon = section?.icon ?? Hammer

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="tile-enter card card-pad text-center">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
              section?.tone ?? 'bg-canvas text-muted'
            }`}
          >
            <Icon size={26} strokeWidth={1.75} />
          </div>

          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {section ? t(sectionNameKey(section.id)) : t('sections.placeholder.title')}
          </h1>

          {section && (
            <p className="mt-1.5 text-[15px] text-muted">{t(sectionDescriptionKey(section.id))}</p>
          )}

          <div className="mt-5 rounded-xl border border-line bg-canvas px-4 py-3">
            <p className="text-[13px] leading-relaxed text-muted">
              {t('sections.placeholder.body')}
            </p>
          </div>

          <Link to="/" className="btn-secondary mt-5">
            <ArrowLeft size={16} strokeWidth={2} />
            {t('sections.placeholder.back')}
          </Link>
        </div>
      </div>
    </div>
  )
}
