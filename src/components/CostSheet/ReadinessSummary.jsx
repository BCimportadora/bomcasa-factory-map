import { AlertCircle, ArrowRight, CheckCircle2, CircleHelp, FileSpreadsheet } from 'lucide-react'
import { useI18n } from '../../i18n'
import SourceTag from './SourceTag'

/**
 * Stage one: what the files answered, and what is still open.
 *
 * Deliberately shown before the form rather than as errors inside it. Somebody
 * about to convert a sheet needs to know at the outset that the exchange rate
 * is not in the file and that CUENTA T holds the freight in pesos -- those two
 * facts change what they go and look up, and finding them out one blurred red
 * field at a time is how a person ends up accepting a figure nobody stated.
 */

const TONE = {
  found: { icon: CheckCircle2, className: 'text-success' },
  partial: { icon: AlertCircle, className: 'text-warning' },
  choose: { icon: CircleHelp, className: 'text-warning' },
  currency: { icon: CircleHelp, className: 'text-warning' },
  missing: { icon: AlertCircle, className: 'text-danger' },
  noFile: { icon: AlertCircle, className: 'text-warning' },
}

function FileRead({ title, subtitle, rows }) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <FileSpreadsheet size={15} strokeWidth={2} className="flex-shrink-0 text-accent" />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <p className="hint mt-0.5">{subtitle}</p>
      <dl className="mt-3 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-[13px]">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function ReadinessSummary({ readiness, source, invoice, onContinue, onBack }) {
  const { t, tCount } = useI18n()

  const open = readiness.filter((item) => item.status !== 'found')

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <h2 className="section-title">{t('costSheet.readiness.readTitle')}</h2>
        <p className="hint mt-1">{t('costSheet.readiness.readBody')}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FileRead
            title={source.fileName}
            subtitle={t('costSheet.readiness.costSubtitle', { sheet: source.sheetName })}
            rows={[
              [t('costSheet.readiness.shipment'), source.shipmentName ?? '—'],
              [t('costSheet.readiness.lines'), tCount('costSheet.readiness.lineCount', source.lines.length)],
              [t('costSheet.readiness.rates'), tCount('costSheet.readiness.rateCount', source.rates.length)],
              [
                t('costSheet.readiness.lookup'),
                source.lookup
                  ? tCount('costSheet.readiness.lookupCount', source.lookup.entries.length)
                  : '—',
              ],
            ]}
          />
          {invoice ? (
            <FileRead
              title={invoice.fileName}
              subtitle={t('costSheet.readiness.invoiceSubtitle', {
                invoice: invoice.invoiceSheet ?? '—',
                packing: invoice.packingSheet ?? '—',
              })}
              rows={[
                [t('costSheet.readiness.invoiceNo'), invoice.invoiceNo ?? '—'],
                [t('costSheet.readiness.lines'), tCount('costSheet.readiness.lineCount', invoice.lineCount)],
                [
                  t('costSheet.readiness.aranceles'),
                  String(
                    new Set(
                      invoice.blocks
                        .flatMap((b) => b.lines)
                        .map((l) => l.arancel)
                        .filter(Boolean),
                    ).size,
                  ),
                ],
              ]}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-line p-4">
              <p className="text-[14px] font-semibold text-ink">{t('costSheet.readiness.noInvoice')}</p>
              <p className="hint mt-1">{t('costSheet.readiness.noInvoiceBody')}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title">{t('costSheet.readiness.needsTitle')}</h2>
        <p className="hint mt-1">
          {open.length === 0
            ? t('costSheet.readiness.needsNone')
            : tCount('costSheet.readiness.needsCount', open.length)}
        </p>

        <ul className="mt-4 space-y-2.5">
          {readiness.map((item) => {
            const tone = TONE[item.status] ?? TONE.missing
            const Icon = tone.icon
            return (
              <li key={item.id} className="flex gap-3 rounded-xl border border-line px-3.5 py-3">
                <Icon size={16} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${tone.className}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">
                    {t(`costSheet.needs.${item.id}.label`)}
                    <span className="ml-2 font-mono text-[12px] font-normal text-muted">{item.cell}</span>
                  </p>
                  <p className="hint mt-0.5">
                    {t(`costSheet.needs.${item.id}.${item.status}`, {
                      count: item.count ?? item.found ?? item.options ?? 0,
                      missing: item.missing?.length ?? item.missing ?? 0,
                      total: item.total ?? 0,
                      value: item.value ?? '',
                    })}
                  </p>
                  {item.source && <SourceTag source={item.source} />}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onContinue} className="btn-primary">
            {t('costSheet.readiness.continue')}
            <ArrowRight size={15} strokeWidth={2} />
          </button>
          <button type="button" onClick={onBack} className="btn-secondary">
            {t('costSheet.readiness.back')}
          </button>
        </div>
      </div>
    </div>
  )
}
