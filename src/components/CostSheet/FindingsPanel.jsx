import { AlertTriangle, Ban, Check, Download, Save } from 'lucide-react'
import { useI18n } from '../../i18n'
import { findingKey } from '../../lib/costSheetModel'

/**
 * Stage three: the last check before anything is written.
 *
 * BLOCKING findings disable the download. WARNINGs allow it once acknowledged,
 * and what was acknowledged is written into the generated workbook -- so a file
 * whose gaps were accepted says so to whoever opens it next, which is the only
 * thing that stops an incomplete sheet becoming an authoritative one.
 *
 * Findings arrive grouped by field, so eleven products with no list price are
 * one row naming eleven codes rather than eleven rows to work through. Each
 * says what the consequence is: which cell stays empty, which figure cannot be
 * computed.
 */

function Codes({ codes }) {
  const { t } = useI18n()
  if (!codes?.length) return null
  const shown = codes.slice(0, 12)
  return (
    <p className="mt-1.5 flex flex-wrap gap-1">
      {shown.map((code) => (
        <span key={code} className="badge-neutral font-mono text-[11px]">
          {code}
        </span>
      ))}
      {codes.length > shown.length && (
        <span className="badge-neutral text-[11px]">
          {t('costSheet.findings.more', { count: codes.length - shown.length })}
        </span>
      )}
    </p>
  )
}

function Finding({ finding, accepted, onAccept, language }) {
  const { t, tOr } = useI18n()
  const blocking = finding.level === 'blocking'
  const Icon = blocking ? Ban : AlertTriangle

  const numbers = (value) =>
    value == null
      ? ''
      : new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
          maximumFractionDigits: 2,
        }).format(value)

  const params = {
    count: finding.count ?? finding.codes?.length ?? 0,
    expected: numbers(finding.expected),
    actual: numbers(finding.actual),
    difference: numbers(finding.difference),
    fields: (finding.keys ?? []).map((key) => t(`costSheet.expenses.${key}`)).join(', '),
  }

  return (
    <li
      className={`rounded-xl border px-3.5 py-3
        ${blocking ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5'}`}
    >
      <div className="flex gap-3">
        <Icon
          size={16}
          strokeWidth={2}
          className={`mt-0.5 flex-shrink-0 ${blocking ? 'text-danger' : 'text-warning'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">
            {t(`costSheet.findings.${finding.id}.title`, params)}
          </p>
          <p className="hint mt-0.5">
            {tOr(`costSheet.findings.${finding.id}.consequence`, '', params)}
          </p>
          <Codes codes={finding.codes} />

          {!blocking && (
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => onAccept(findingKey(finding), event.target.checked)}
              />
              {t('costSheet.findings.accept')}
            </label>
          )}
        </div>
      </div>
    </li>
  )
}

export default function FindingsPanel({
  findings,
  accepted,
  onAccept,
  onDownload,
  onSave,
  canDownload,
  busy,
  saveState,
  orders,
  orderId,
  onOrderChange,
}) {
  const { t, tCount, language } = useI18n()

  const blocking = findings.filter((f) => f.level === 'blocking')
  const warnings = findings.filter((f) => f.level === 'warning')
  const unacknowledged = warnings.filter((f) => !accepted.has(findingKey(f)))

  return (
    <div className="card card-pad">
      <h2 className="section-title">{t('costSheet.findings.title')}</h2>
      <p className="hint mt-1">
        {findings.length === 0
          ? t('costSheet.findings.clean')
          : `${tCount('costSheet.findings.blockingCount', blocking.length)} · ${tCount(
              'costSheet.findings.warningCount',
              warnings.length,
            )}`}
      </p>

      {blocking.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-danger">
            {tCount('costSheet.findings.blockingCount', blocking.length)}
          </h3>
          <ul className="mt-2 space-y-2">
            {blocking.map((finding) => (
              <Finding key={findingKey(finding)} finding={finding} language={language} accepted={false} onAccept={onAccept} />
            ))}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-warning">
            {tCount('costSheet.findings.warningCount', warnings.length)}
          </h3>
          <ul className="mt-2 space-y-2">
            {warnings.map((finding) => (
              <Finding
                key={findingKey(finding)}
                finding={finding}
                language={language}
                accepted={accepted.has(findingKey(finding))}
                onAccept={onAccept}
              />
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 border-t border-line pt-5">
        <button type="button" onClick={onDownload} disabled={!canDownload || busy} className="btn-primary">
          <Download size={15} strokeWidth={2} />
          {t('costSheet.findings.download')}
        </button>

        {blocking.length > 0 && <p className="hint mt-2 text-danger">{t('costSheet.findings.blockedHint')}</p>}
        {blocking.length === 0 && unacknowledged.length > 0 && (
          <p className="hint mt-2 text-warning">
            {tCount('costSheet.findings.acceptHint', unacknowledged.length)}
          </p>
        )}

        {/* Filing the generated sheet with the order it belongs to. Explicit
            rather than automatic: it puts a document in front of the whole
            team, and which order it belongs to is a person's call. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="cs-order">
              {t('costSheet.findings.saveTo')}
            </label>
            <select
              id="cs-order"
              className="select"
              value={orderId}
              onChange={(event) => onOrderChange(event.target.value)}
            >
              <option value="">{t('costSheet.findings.chooseOrder')}</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={!canDownload || !orderId || busy}
            className="btn-secondary"
          >
            {saveState === 'saved' ? <Check size={15} strokeWidth={2} /> : <Save size={15} strokeWidth={2} />}
            {saveState === 'saved' ? t('costSheet.findings.saved') : t('costSheet.findings.save')}
          </button>
        </div>
        {saveState === 'saved' && <p className="hint mt-2 text-success">{t('costSheet.findings.savedHint')}</p>}
        {saveState && saveState !== 'saved' && saveState !== 'saving' && (
          <p className="hint mt-2 text-danger">{saveState}</p>
        )}
      </div>
    </div>
  )
}
