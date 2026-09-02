import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { useCatalog } from '../hooks/useCatalog'
import { useOrders } from '../hooks/useOrders'
import { useFactories } from '../hooks/useFactories'
import { attachFilesToOrder } from '../hooks/useOrderFiles'
import { readWorkbook, isSupported as xlsxSupported } from '../lib/xlsxReader'
import { parseCostSheetWorkbook, FORMAT, EXPENSE_KEYS } from '../lib/costSheetSource'
import { parseCommercialInvoice } from '../lib/commercialInvoice'
import { codeKey, formatProductCode, orderSortKey } from '../lib/catalog'
import { factoryLabel } from '../lib/factories'
import {
  arancelRateIndex,
  buildFindings,
  buildReadiness,
  computeSheet,
  DEFAULT_GRAVAMEN_SOURCE,
  DEFAULT_ITBIS_BASE,
  findingKey,
  isBlocked,
  parseAmount,
  prepareLines,
  toUsd,
} from '../lib/costSheetModel'
import { buildCostSheetWorkbook, costSheetFileName } from '../lib/costSheetWriter'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import UploadStep from '../components/CostSheet/UploadStep'
import ReadinessSummary from '../components/CostSheet/ReadinessSummary'
import ShipmentForm from '../components/CostSheet/ShipmentForm'
import SheetPreview from '../components/CostSheet/SheetPreview'
import FindingsPanel from '../components/CostSheet/FindingsPanel'

/**
 * Bringing an old cost sheet onto the current format.
 *
 * Three moments, in order: what the files answered, what has to be stated, and
 * what is still wrong. The whole section exists because the old sheets are
 * INCOMPLETE -- no freight allocation, no exchange rate, no pricing block --
 * and the failure to avoid is a converted sheet that looks finished while
 * carrying figures nobody supplied.
 *
 * The Catalog is read for descriptions, list prices and the tariff rates, and
 * nothing here writes to it. The only thing this page can write is a generated
 * file into an order's paperwork, and that takes an explicit press.
 */

const STEPS = { upload: 'upload', readiness: 'readiness', work: 'work' }

/** The four decisions, and the freight currency's own default rule. */
const initialForm = (source) => {
  const rates = source.rates ?? []
  // The DGII rate is the one customs actually charged against, so it leads;
  // the average is the fallback where DGII is not stated.
  const preferred = rates.find((r) => r.id === 'dgii') ?? rates.find((r) => r.id === 'average') ?? rates[0]
  const asText = (value) => (value == null ? '' : String(value))

  return {
    shipmentName: source.shipmentName ?? '',
    // A sheet that already states its own rate needs no choosing.
    rateChoice: source.exchangeRate ? 'sheet' : (preferred?.id ?? 'manual'),
    manualRate: '',
    // Dollars when the header stated them, pesos when they came off CUENTA T.
    currency: source.freightUsd ? 'USD' : 'DOP',
    freight: asText(source.freightUsd?.value ?? source.accountFreight?.value ?? ''),
    insurance: asText(source.insuranceUsd?.value ?? source.accountInsurance?.value ?? ''),
    expenses: Object.fromEntries(EXPENSE_KEYS.map((k) => [k, asText(source.expenses?.[k]?.value ?? '')])),
    entryNumbers: Object.fromEntries(EXPENSE_KEYS.map((k) => [k, asText(source.entryNumbers?.[k]?.value ?? '')])),
    itbisBase: DEFAULT_ITBIS_BASE,
    gravamenSource: DEFAULT_GRAVAMEN_SOURCE,
  }
}

export default function CostSheetPage() {
  const { t, tOr, language } = useI18n()
  const { user } = useAuth()
  const { products } = useCatalog()
  const { orders } = useOrders()
  const { factories } = useFactories()

  const [step, setStep] = useState(STEPS.upload)
  const [files, setFiles] = useState({ cost: null, invoice: null })
  const [parsed, setParsed] = useState(null) // { source, invoice }
  const [form, setForm] = useState(null)
  const [edits, setEdits] = useState(new Set())
  const [accepted, setAccepted] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState('')
  const [saveState, setSaveState] = useState(null)

  const reset = () => {
    setStep(STEPS.upload)
    setParsed(null)
    setForm(null)
    setEdits(new Set())
    setAccepted(new Set())
    setError('')
    setSaveState(null)
  }

  const read = async () => {
    setBusy(true)
    setError('')
    try {
      if (!xlsxSupported()) throw new Error('unsupported')

      const workbook = await readWorkbook(files.cost)
      const source = parseCostSheetWorkbook(workbook, { fileName: files.cost.name })

      if (source.format === FORMAT.UNKNOWN) throw new Error('notACostSheet')
      if (source.format === FORMAT.TARGET) throw new Error('alreadyTarget')
      if (source.lines.length === 0) throw new Error('noLines')

      let invoice = null
      if (files.invoice) {
        try {
          invoice = parseCommercialInvoice(await readWorkbook(files.invoice), {
            fileName: files.invoice.name,
          })
        } catch (err) {
          // The cost sheet alone is a complete input. An unreadable second file
          // is reported and the conversion continues without it, rather than
          // throwing away work over the optional document.
          setError(t('costSheet.errors.invoiceUnreadable', { message: err.message }))
        }
      }

      setParsed({ source, invoice })
      setForm(initialForm(source))
      setStep(STEPS.readiness)
    } catch (err) {
      setError(tOr(`costSheet.errors.${err.message}`, err.message))
    } finally {
      setBusy(false)
    }
  }

  const setField = useCallback((path, value) => {
    setEdits((current) => new Set(current).add(path))
    setForm((current) => {
      const [head, key] = path.split('.')
      if (key) return { ...current, [head]: { ...current[head], [key]: value } }
      return { ...current, [head]: value }
    })
  }, [])

  // --- everything below recomputes on every keystroke ------------------------

  const catalogByKey = useMemo(() => {
    const index = new Map()
    for (const product of products) if (product.code_key) index.set(product.code_key, product)
    return index
  }, [products])

  const arancelRates = useMemo(() => arancelRateIndex(products), [products])

  const invoiceByKey = useMemo(() => {
    const index = new Map()
    for (const block of parsed?.invoice?.blocks ?? []) {
      for (const line of block.lines) {
        const key = codeKey(line.product_code)
        if (key && !index.has(key)) index.set(key, line)
      }
    }
    return index
  }, [parsed])

  const sourceLookup = useMemo(() => {
    const index = new Map()
    for (const entry of parsed?.source?.lookup?.entries ?? []) {
      const key = codeKey(entry.code)
      if (key && !index.has(key)) index.set(key, entry)
    }
    return index
  }, [parsed])

  const rateOptions = useMemo(() => {
    if (!parsed) return []
    const options = [...(parsed.source.rates ?? [])]
    if (parsed.source.exchangeRate) {
      options.unshift({ id: 'sheet', value: parsed.source.exchangeRate.value, source: parsed.source.exchangeRate.source })
    }
    return options
  }, [parsed])

  const model = useMemo(() => {
    if (!parsed || !form) return null

    const chosen = rateOptions.find((option) => option.id === form.rateChoice)
    const exchangeRate = form.rateChoice === 'manual' ? parseAmount(form.manualRate) : (chosen?.value ?? null)

    const lines = prepareLines({
      sourceLines: parsed.source.lines,
      sourceLookup,
      catalogByKey,
      invoiceByKey,
      arancelRates,
      gravamenSource: form.gravamenSource,
    })

    const input = {
      shipmentName: form.shipmentName,
      exchangeRate,
      freightUsd: toUsd(parseAmount(form.freight), form.currency, exchangeRate),
      insuranceUsd: toUsd(parseAmount(form.insurance), form.currency, exchangeRate),
      expenses: Object.fromEntries(EXPENSE_KEYS.map((k) => [k, parseAmount(form.expenses[k])])),
      entryNumbers: form.entryNumbers,
      itbisBase: form.itbisBase,
      lines,
    }

    const computed = computeSheet(input)

    // Products on one document and not the other. Reported, never reconciled:
    // it is either an air shipment or paperwork disagreeing with itself.
    const costKeys = new Set(parsed.source.lines.map((l) => codeKey(l.product_code)).filter(Boolean))
    const context = { singleFile: !parsed.invoice }
    if (parsed.invoice) {
      context.onlyInCostSheet = [...costKeys]
        .filter((key) => !invoiceByKey.has(key))
        .map((key) => formatProductCode(key))
      context.onlyInInvoice = [...invoiceByKey.keys()]
        .filter((key) => !costKeys.has(key))
        .map((key) => formatProductCode(key))
    }

    const findings = buildFindings({
      input,
      computed,
      sourceTotals: parsed.source.statedTotals,
      context,
    })

    return { input, computed, findings, exchangeRate }
  }, [parsed, form, rateOptions, sourceLookup, catalogByKey, invoiceByKey, arancelRates])

  const readiness = useMemo(
    () => (parsed ? buildReadiness({ source: parsed.source, invoice: parsed.invoice }) : []),
    [parsed],
  )

  const outstanding = useMemo(
    () => (model?.findings ?? []).filter((f) => f.level === 'warning' && !accepted.has(findingKey(f))),
    [model, accepted],
  )

  const canDownload = Boolean(model) && !isBlocked(model.findings) && outstanding.length === 0

  /** The record written onto the workbook's NOTAS sheet. */
  const notes = useMemo(() => {
    if (!model || !form) return []
    const chosen = rateOptions.find((o) => o.id === form.rateChoice)
    const list = [
      [t('costSheet.notes.generated'), new Date().toISOString().slice(0, 10)],
      [t('costSheet.notes.sourceFile'), parsed?.source.fileName ?? ''],
      [t('costSheet.notes.invoiceFile'), parsed?.invoice?.fileName ?? t('costSheet.notes.none')],
      [t('costSheet.form.itbisTitle'), t(`costSheet.itbis.${form.itbisBase}.label`)],
      [
        t('costSheet.form.exchangeRate'),
        `${model.exchangeRate ?? ''} — ${t(`costSheet.rates.${form.rateChoice === 'manual' ? 'manual' : form.rateChoice}`)}${
          chosen?.source?.cell ? ` (${chosen.source.sheet}!${chosen.source.cell})` : ''
        }`,
      ],
      [t('costSheet.form.gravamenTitle'), t(`costSheet.gravamen.${form.gravamenSource}.label`)],
      [t('costSheet.notes.currency'), t(`costSheet.form.currency.${form.currency}`)],
    ]
    for (const finding of model.findings) {
      if (finding.level !== 'warning') continue
      list.push([
        t('costSheet.notes.accepted'),
        `${t(`costSheet.findings.${finding.id}.title`, {
          count: finding.count ?? finding.codes?.length ?? 0,
          expected: finding.expected ?? '',
          actual: finding.actual ?? '',
          difference: finding.difference ?? '',
          fields: (finding.keys ?? []).join(', '),
        })}${finding.codes?.length ? ` — ${finding.codes.join(', ')}` : ''}`,
      ])
    }
    return list
  }, [model, form, parsed, rateOptions, t])

  const buildFile = async () => {
    const blob = await buildCostSheetWorkbook({
      computed: model.computed,
      input: model.input,
      sourceLookupEntries: parsed.source.lookup?.entries ?? [],
      notes,
    })
    return new File([blob], costSheetFileName(form.shipmentName), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  }

  const download = async () => {
    setBusy(true)
    try {
      const file = await buildFile()
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(tOr(`costSheet.errors.${err.message}`, err.message))
    } finally {
      setBusy(false)
    }
  }

  /** File the generated sheet against an order, as a liquidación de costo. */
  const saveToOrder = async () => {
    setBusy(true)
    setSaveState('saving')
    try {
      const file = await buildFile()
      await attachFilesToOrder(orderId, [file], user?.id, 'liquidacion')
      setSaveState('saved')
    } catch (err) {
      setSaveState(tOr(`costSheet.errors.${err.message}`, err.message))
    } finally {
      setBusy(false)
    }
  }

  /**
   * The orders this file could belong to, the likeliest first.
   *
   * Matched on the shipment name, which IS an order reference -- "CHS 09" is
   * the supplier's nickname and its number, the same string the orders table
   * holds. Nothing is chosen automatically; the list is merely ordered so the
   * right one is usually at the top.
   */
  const orderOptions = useMemo(() => {
    const byId = new Map(factories.map((f) => [f.id, f]))
    const wanted = orderSortKey(form?.shipmentName ?? '')
    return [...orders]
      .map((order) => ({
        id: order.id,
        label: `${order.reference ?? t('costSheet.findings.noReference')}${
          byId.get(order.factory_id) ? ` — ${factoryLabel(byId.get(order.factory_id))}` : ''
        }`,
        match: orderSortKey(order.reference ?? '') === wanted,
      }))
      .sort((a, b) => (a.match === b.match ? a.label.localeCompare(b.label) : a.match ? -1 : 1))
  }, [orders, factories, form, t])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex items-start gap-3">
          <span className="badge-accent mt-1 flex-shrink-0 rounded-xl p-2">
            <FileSpreadsheet size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="page-title">{t(sectionNameKey('costSheet'))}</h1>
            <p className="page-subtitle">{t(sectionDescriptionKey('costSheet'))}</p>
          </div>
        </div>

        <div className="mt-7 space-y-5">
          {step === STEPS.upload && (
            <UploadStep
              costFile={files.cost}
              invoiceFile={files.invoice}
              busy={busy}
              error={error}
              onPick={(slot, file) => setFiles((current) => ({ ...current, [slot]: file }))}
              onClear={(slot) => setFiles((current) => ({ ...current, [slot]: null }))}
              onRead={read}
            />
          )}

          {step === STEPS.readiness && parsed && (
            <ReadinessSummary
              readiness={readiness}
              source={parsed.source}
              invoice={parsed.invoice}
              onContinue={() => setStep(STEPS.work)}
              onBack={reset}
            />
          )}

          {step === STEPS.work && parsed && form && model && (
            <>
              <button type="button" onClick={() => setStep(STEPS.readiness)} className="btn-ghost btn-sm">
                <ArrowLeft size={14} strokeWidth={2} />
                {t('costSheet.backToSummary')}
              </button>

              <ShipmentForm
                form={form}
                setField={setField}
                source={parsed.source}
                edits={edits}
                rateOptions={rateOptions}
                exchangeRate={model.exchangeRate}
                language={language}
              />

              <SheetPreview computed={model.computed} />

              <FindingsPanel
                findings={model.findings}
                accepted={accepted}
                onAccept={(key, on) =>
                  setAccepted((current) => {
                    const next = new Set(current)
                    if (on) next.add(key)
                    else next.delete(key)
                    return next
                  })
                }
                onDownload={download}
                onSave={saveToOrder}
                canDownload={canDownload}
                busy={busy}
                saveState={saveState}
                orders={orderOptions}
                orderId={orderId}
                onOrderChange={(id) => {
                  setOrderId(id)
                  setSaveState(null)
                }}
              />

              {error && (
                <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
