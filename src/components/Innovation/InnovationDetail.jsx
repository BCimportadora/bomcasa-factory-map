import { useState } from 'react'
import { ArrowRight, CalendarDays, Pencil, Trash2, User, UserCheck } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import Modal from '../common/Modal'
import InnovationImage from './InnovationImage'
import LabelBadge, { SafetyBadge } from './LabelBadge'
import {
  canPromote,
  formatDateTime,
  formatMoney,
  formatUnits,
  plannedTotal,
  quotesFor,
} from '../../lib/innovations'
import { fullName } from '../../lib/constants'

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="flex w-36 flex-shrink-0 items-center gap-1.5 text-[13px] text-muted">
        {Icon && <Icon size={13} strokeWidth={1.75} />}
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words text-[14px] text-ink">{children}</dd>
    </div>
  )
}

/** One factory's quote: who, whether they are safe, and how much. */
function QuoteLine({ quote, factory }) {
  const { t, language } = useI18n()
  const price = formatMoney(quote.quoted_price, quote.currency, language)

  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] text-ink">
          {factory?.name ?? t('innovations.unknownFactory')}
        </span>
        <SafetyBadge safety={quote.safety} className="flex-shrink-0" />
      </div>
      <span className="flex-shrink-0 text-[13px] font-medium text-ink">
        {price ?? t('innovations.awaitingQuote')}
      </span>
    </li>
  )
}

function QuoteGroup({ title, quotes, factoriesById }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {quotes.length === 0 ? (
        <p className="hint mt-1 italic">{t('innovations.noQuotes')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {quotes.map((quote) => (
            <QuoteLine key={quote.id} quote={quote} factory={factoriesById.get(quote.factory_id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Everything known about one innovation.
 *
 * Opened by clicking the picture on the board. Promotion to the ready-to-order
 * section lives here and is shown only to administrators, and only once the
 * item is labelled done — the database enforces both, so this is a convenience
 * rather than the control.
 */
export default function InnovationDetail({
  innovation,
  factories,
  profiles,
  showOrderPlan = false,
  onClose,
  onEdit,
  onDelete,
  onPromote,
  onDemote,
}) {
  const { t, language } = useI18n()
  const { isAdmin, user } = useAuth()
  const [active, setActive] = useState(0)

  const images = innovation.innovation_images ?? []
  const variations = innovation.innovation_variations ?? []
  const factoriesById = new Map(factories.map((factory) => [factory.id, factory]))
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  const author = profilesById.get(innovation.created_by)
  const assignee = profilesById.get(innovation.assigned_to)
  const total = plannedTotal(innovation)
  const canDelete = isAdmin || innovation.created_by === user?.id

  return (
    <Modal size="wide" title={innovation.name} onClose={onClose}>
      <InnovationImage
        path={images[active]?.storage_path}
        alt={innovation.name}
        ratio="aspect-[16/10]"
      />

      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={t('innovations.showImage', { number: index + 1 })}
              className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg ring-2 transition-colors ${
                index === active ? 'ring-accent' : 'ring-transparent hover:ring-line'
              }`}
            >
              <InnovationImage path={image.storage_path} alt="" ratio="aspect-square" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <LabelBadge label={innovation.label} />
        <span className="hint">{t(`innovations.stages.${innovation.stage}`)}</span>
      </div>

      <dl className="mt-3 divide-y divide-line border-t border-line pt-1">
        <Row icon={User} label={t('innovations.addedBy')}>
          {author ? fullName(author) || author.email : t('common.none')}
        </Row>
        <Row icon={CalendarDays} label={t('innovations.addedOn')}>
          {formatDateTime(innovation.created_at, language) ?? t('common.none')}
        </Row>
        <Row icon={UserCheck} label={t('innovations.assignedTo')}>
          {assignee ? fullName(assignee) || assignee.email : t('innovations.nobodyAssigned')}
        </Row>
        <Row label={t('innovations.localPrice')}>
          {formatMoney(innovation.local_price, innovation.local_currency, language) ??
            t('common.none')}
          {innovation.local_price_notes && (
            <span className="ml-2 text-muted">{innovation.local_price_notes}</span>
          )}
        </Row>
        {innovation.notes && <Row label={t('innovations.notes')}>{innovation.notes}</Row>}
      </dl>

      {/* The order plan tab, shown only in the ready-to-order section. */}
      {showOrderPlan && (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
          <p className="section-title mb-2">{t('innovations.orderPlan')}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="hint">{t('innovations.fobPrice')}</p>
              <p className="text-[15px] font-semibold text-ink">
                {formatMoney(innovation.fob_price, innovation.fob_currency, language) ?? '—'}
              </p>
            </div>
            <div>
              <p className="hint">{t('innovations.plannedUnits')}</p>
              <p className="text-[15px] font-semibold text-ink">
                {formatUnits(innovation.planned_units, language) ?? '—'}
              </p>
            </div>
            <div>
              <p className="hint">{t('innovations.plannedTotal')}</p>
              <p className="text-[15px] font-semibold text-ink">
                {formatMoney(total, innovation.fob_currency, language) ?? '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="section-title mb-2">{t('innovations.variations')}</p>
        <div className="space-y-2">
          <QuoteGroup
            title={t('innovations.itemItself')}
            quotes={quotesFor(innovation, null)}
            factoriesById={factoriesById}
          />
          {variations.map((variation) => (
            <QuoteGroup
              key={variation.id}
              title={variation.name}
              quotes={quotesFor(innovation, variation.id)}
              factoriesById={factoriesById}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => onEdit(innovation)} className="btn-secondary btn-sm">
          <Pencil size={14} />
          {t('common.edit')}
        </button>

        {/* Promotion is an administrator's call, and only for finished items. */}
        {isAdmin && innovation.stage === 'development' && (
          <button
            type="button"
            onClick={() => onPromote(innovation)}
            disabled={!canPromote(innovation)}
            title={canPromote(innovation) ? undefined : t('innovations.promoteNeedsDone')}
            className="btn-primary btn-sm disabled:opacity-50"
          >
            {t('innovations.promote')}
            <ArrowRight size={14} />
          </button>
        )}
        {isAdmin && innovation.stage === 'ready' && (
          <button type="button" onClick={() => onDemote(innovation)} className="btn-secondary btn-sm">
            {t('innovations.demote')}
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(innovation)}
            className="btn-ghost btn-sm ml-auto text-danger hover:bg-danger/5 hover:text-danger"
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        )}
      </div>

      {!isAdmin && innovation.label === 'done' && innovation.stage === 'development' && (
        <p className="hint mt-2">{t('innovations.promoteAdminOnly')}</p>
      )}
    </Modal>
  )
}
