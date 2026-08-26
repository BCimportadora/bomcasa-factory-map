import { Component } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * Catches a render error in one section instead of losing the whole page.
 *
 * Without this, a throw anywhere in the tree unmounts everything and leaves a
 * white screen with no message — which looks identical to a network failure, a
 * bad deploy, or a hung load, and can only be told apart with devtools open.
 * Showing the error is worth more than hiding it: whoever hits it can read it
 * out over the phone.
 *
 * Error boundaries have to be class components; there is no hook equivalent.
 */
class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Keep the full stack in the console for anyone who does open devtools.
    console.error('Section crashed:', error, info?.componentStack)
  }

  render() {
    const { error, info } = this.state
    const { t, children } = this.props
    if (!error) return children

    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10 sm:px-8">
          <div className="card card-pad">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger">
                <AlertTriangle size={20} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
                  {t('errors.sectionFailed')}
                </h1>
                <p className="mt-1 text-[14px] text-muted">{t('errors.sectionFailedHint')}</p>
              </div>
            </div>

            {/* The message itself, selectable so it can be copied or read out. */}
            <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink">
              {String(error?.message || error)}
            </pre>

            {info?.componentStack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">
                  {t('errors.technicalDetail')}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                  {info.componentStack.trim()}
                </pre>
              </details>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary"
              >
                <RotateCw size={16} strokeWidth={2} />
                {t('errors.reload')}
              </button>
              <Link to="/" className="btn-secondary">
                <ArrowLeft size={16} strokeWidth={2} />
                {t('sections.placeholder.back')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Keyed on the path so that navigating away clears a caught error: a boundary
 * that stays broken after you leave the broken page is its own bug.
 */
export default function ErrorBoundary({ children }) {
  const { t } = useI18n()
  const location = useLocation()
  return (
    <Boundary key={location.pathname} t={t}>
      {children}
    </Boundary>
  )
}
