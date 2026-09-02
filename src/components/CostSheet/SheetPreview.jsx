import { useI18n } from '../../i18n'
import { COLUMNS, round } from '../../lib/costSheetModel'

/**
 * The converted sheet as it will be written, every column and the totals row.
 *
 * Shown in full rather than summarised. The point of the preview is to be
 * checked against the paperwork on the desk beside it, and a column that has
 * been folded away is one nobody checks. It scrolls sideways inside its own box
 * so the page itself never does -- see the document-scroll note in CLAUDE.md.
 *
 * A value that could not be computed renders as an em dash, never as 0.00.
 */

const money = (value, language) =>
  value == null
    ? null
    : new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(round(value, 2))

const integer = (value, language) =>
  value == null ? null : new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB').format(value)

const ratio = (value, language) =>
  value == null
    ? null
    : new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)

const render = (column, value, language) => {
  if (value == null || value === '') return null
  if (column.kind === 'money') return money(value, language)
  if (column.kind === 'int') return integer(value, language)
  if (column.kind === 'ratio') return ratio(value, language)
  return String(value)
}

export default function SheetPreview({ computed }) {
  const { t, language } = useI18n()
  const { rows, totals } = computed

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{t('costSheet.preview.title')}</h2>
        <p className="hint">{t('costSheet.preview.rows', { count: rows.length })}</p>
      </div>
      <p className="hint mt-1">{t('costSheet.preview.body')}</p>

      <div className="mt-4 overflow-auto rounded-xl border border-line" style={{ maxHeight: '28rem' }}>
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`whitespace-pre-line border-b border-line px-2.5 py-2 align-bottom font-semibold text-ink
                    ${column.kind === 'text' ? 'text-left' : 'text-right'}`}
                >
                  <span className="block font-mono text-[10px] font-normal text-muted">{column.letter}</span>
                  {column.header.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.no} className="border-b border-line last:border-0 hover:bg-canvas">
                {COLUMNS.map((column) => {
                  const shown = render(column, row[column.key], language)
                  return (
                    <td
                      key={column.key}
                      className={`whitespace-nowrap px-2.5 py-1.5
                        ${column.kind === 'text' ? 'text-left' : 'text-right tabular-nums'}
                        ${shown == null ? 'text-muted' : 'text-ink'}`}
                      title={column.key === 'description' ? row.description ?? '' : undefined}
                    >
                      {column.key === 'description' ? (
                        <span className="block max-w-[22rem] truncate">{shown ?? '—'}</span>
                      ) : (
                        (shown ?? '—')
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-surface">
            <tr className="border-t-2 border-line font-semibold">
              {COLUMNS.map((column) => {
                const value = totals[column.key]
                const shown = column.key === 'no' ? null : render(column, value, language)
                return (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-2.5 py-2
                      ${column.kind === 'text' ? 'text-left' : 'text-right tabular-nums'} text-ink`}
                  >
                    {column.key === 'code' ? t('costSheet.preview.totals') : (shown ?? '')}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="hint">{t('costSheet.preview.costFactor')}</dt>
          <dd className="text-[17px] font-semibold text-ink">{money(computed.costFactor, language) ?? '—'}</dd>
        </div>
        <div>
          <dt className="hint">{t('costSheet.preview.grossMargin')}</dt>
          <dd className="text-[17px] font-semibold text-ink">{ratio(computed.grossMarginRatio, language) ?? '—'}</dd>
        </div>
        <div>
          <dt className="hint">{t('costSheet.preview.grossProfit')}</dt>
          <dd className="text-[17px] font-semibold text-ink">{money(computed.grossProfit, language) ?? '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
