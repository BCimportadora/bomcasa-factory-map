import { useI18n } from '../../i18n'
import { locationTypeKey } from '../../lib/constants'
import { factoryLabel } from '../../lib/factories'

export default function FactoryList({ factories, onSelect, onEdit, onDelete, canManage }) {
  const { t } = useI18n()

  if (factories.length === 0) {
    return <p className="px-5 py-8 text-center text-[14px] text-muted">{t('factories.empty')}</p>
  }

  return (
    <ul className="divide-y divide-line">
      {factories.map((f) => (
        <li key={f.id} className="group px-4 py-3 transition-colors hover:bg-canvas">
          <button onClick={() => onSelect(f)} className="block w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                {factoryLabel(f)}
              </p>
              {/* Only flagged when it is not a plant — a badge on every row
                  would carry no information. */}
              {f.location_type && f.location_type !== 'factory' && (
                <span className="badge-neutral mt-0.5 flex-shrink-0">
                  {t(locationTypeKey(f.location_type))}
                </span>
              )}
            </div>
            {/* Only when the nickname displaced it. Repeating the name under
                itself would be noise on every row that has no nickname. */}
            {f.nickname?.trim() && (
              <p className="truncate text-[12px] text-muted">{f.name}</p>
            )}
            <p className="truncate text-[13px] text-muted">
              {[f.city, f.province].filter(Boolean).join(', ') || t('common.none')}
            </p>
            {f.products && <p className="truncate text-[12px] text-muted/80">{f.products}</p>}
          </button>
          {canManage(f) && (
            <div className="mt-1.5 flex gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button onClick={() => onEdit(f)} className="text-[12px] font-medium text-accent hover:underline">
                {t('common.edit')}
              </button>
              <button onClick={() => onDelete(f)} className="text-[12px] font-medium text-danger hover:underline">
                {t('common.delete')}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
