import { useI18n } from '../../i18n'

export default function SearchFilter({ query, onQueryChange, province, onProvinceChange, provinces }) {
  const { t } = useI18n()

  return (
    <div className="space-y-2.5 border-b border-line p-4">
      <input
        type="search"
        placeholder={t('factories.searchPlaceholder')}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label={t('common.search')}
        className="input text-[14px]"
      />
      <select
        value={province}
        onChange={(e) => onProvinceChange(e.target.value)}
        aria-label={t('factories.province')}
        className="select text-[14px]"
      >
        <option value="">{t('factories.allProvinces')}</option>
        {provinces.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  )
}
