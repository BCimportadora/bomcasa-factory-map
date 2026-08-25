import Papa from 'papaparse'

const EXPORT_COLUMNS = [
  'name',
  'address',
  'city',
  'province',
  'latitude',
  'longitude',
  'contact_person',
  'phone',
  'products',
  'capacity',
  'notes',
]

/**
 * Key used to decide whether an imported row is an existing factory.
 *
 * Company names arrive punctuated every which way — "CO., LTD", "CO.,LTD.",
 * and a full-width comma in at least one supplier list — so only the letters
 * and digits are compared. Deliberately not fuzzy beyond that: merging two
 * genuinely different suppliers is far worse than creating one duplicate.
 */
export const factoryNameKey = (name) =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()

export function exportFactoriesToCsv(factories, filename = 'factories.csv') {
  const rows = factories.map((f) => Object.fromEntries(EXPORT_COLUMNS.map((col) => [col, f[col] ?? ''])))
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function parseFactoriesCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors = []
        const rows = results.data.map((row, i) => {
          const lat = parseFloat(row.latitude)
          const lng = parseFloat(row.longitude)
          if (!row.name) errors.push(`Row ${i + 2}: missing name`)
          if (Number.isNaN(lat) || Number.isNaN(lng)) errors.push(`Row ${i + 2}: invalid latitude/longitude`)
          return {
            name: row.name?.trim() ?? '',
            address: row.address?.trim() ?? '',
            city: row.city?.trim() ?? '',
            province: row.province?.trim() ?? '',
            latitude: lat,
            longitude: lng,
            contact_person: row.contact_person?.trim() ?? '',
            phone: row.phone?.trim() ?? '',
            products: row.products?.trim() ?? '',
            capacity: row.capacity?.trim() ?? '',
            notes: row.notes?.trim() ?? '',
          }
        })
        resolve({ rows, errors })
      },
      error: reject,
    })
  })
}
