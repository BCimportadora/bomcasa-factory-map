// Canonical values shared by the UI, the database check constraints and the
// account-creation Edge Function. Keep these in sync with supabase/schema.sql.

export const DEPARTMENTS = ['sales', 'rnd_purchasing', 'administration', 'accounting']

export const ROLES = ['admin', 'business_user']

export const LANGUAGES = ['en', 'es']

/** Translation key for a department value, e.g. 'sales' -> 'departments.sales' */
export const departmentKey = (value) => `departments.${value}`

/** Translation key for a role value, e.g. 'admin' -> 'roles.admin' */
export const roleKey = (value) => `roles.${value}`

export const isValidDepartment = (value) => DEPARTMENTS.includes(value)
export const isValidRole = (value) => ROLES.includes(value)

/** A profile is only usable once the person has told us who they are. */
export const isProfileComplete = (profile) =>
  Boolean(profile?.first_name?.trim() && profile?.last_name?.trim() && isValidDepartment(profile?.department))

export const fullName = (profile) =>
  [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

export const initials = (profile) => {
  const first = profile?.first_name?.trim()?.[0] ?? ''
  const last = profile?.last_name?.trim()?.[0] ?? ''
  return (first + last).toUpperCase() || '?'
}
