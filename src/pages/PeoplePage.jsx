import { useMemo, useState } from 'react'
import { useProfiles } from '../hooks/useProfiles'
import { useI18n } from '../i18n'
import { DEPARTMENTS, ROLES, departmentKey, roleKey, fullName, initials } from '../lib/constants'

function PersonCard({ person, t }) {
  const name = fullName(person)
  return (
    <li className="card flex items-center gap-4 p-4 transition-shadow duration-200 hover:shadow-subtle">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-[13px] font-semibold text-accent">
        {initials(person)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">
          {name || <span className="text-muted">{t('people.incompleteProfile')}</span>}
        </p>
        <p className="truncate text-[13px] text-muted">
          {person.department ? t(departmentKey(person.department)) : t('common.none')}
        </p>
      </div>
      <span className={person.role === 'admin' ? 'badge-accent' : 'badge-neutral'}>
        {t(roleKey(person.role))}
      </span>
    </li>
  )
}

export default function PeoplePage() {
  const { profiles, loading, error } = useProfiles()
  const { t, tCount } = useI18n()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return profiles.filter((p) => {
      const haystack = [p.first_name, p.last_name, p.department && t(departmentKey(p.department))]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return (
        (!q || haystack.includes(q)) &&
        (!department || p.department === department) &&
        (!role || p.role === role)
      )
    })
  }, [profiles, query, department, role, t])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7">
          <h1 className="page-title">{t('people.title')}</h1>
          <p className="page-subtitle">{t('people.subtitle')}</p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            placeholder={t('people.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('common.search')}
            className="input"
          />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label={t('profile.department')}
            className="select sm:w-52"
          >
            <option value="">{t('people.allDepartments')}</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {t(departmentKey(d))}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label={t('admin.role')}
            className="select sm:w-48"
          >
            <option value="">{t('people.allRoles')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(roleKey(r))}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('common.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('people.loadError')}</p>
        ) : filtered.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t('people.empty')}</p>
            <p className="mt-1 text-[13px] text-muted">{t('people.emptyHint')}</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">{tCount('people.count', filtered.length)}</p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <PersonCard key={p.id} person={p} t={t} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
