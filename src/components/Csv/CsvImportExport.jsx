import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { exportFactoriesToCsv, parseFactoriesCsv } from '../../lib/csv'
import { useI18n } from '../../i18n'

export default function CsvImportExport({ factories, onImport }) {
  const { t } = useI18n()
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setMessage('')
    try {
      const { rows, errors } = await parseFactoriesCsv(file)
      const invalidRowNumbers = new Set(errors.map((err) => parseInt(err.match(/^Row (\d+):/)[1], 10)))
      const validRows = rows.filter((_, i) => !invalidRowNumbers.has(i + 2))
      if (validRows.length > 0) await onImport(validRows)

      const summary = t('csv.importResult', { imported: validRows.length, total: rows.length })
      const skipped = errors.length ? ` ${t('csv.importSkipped', { count: errors.length })}` : ''
      setMessage(summary + skipped)
    } catch (err) {
      setMessage(t('csv.importError', { message: err.message }))
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2 border-b border-line p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => exportFactoriesToCsv(factories)}
          className="btn-secondary btn-sm flex-1"
        >
          <Download size={14} />
          {t('csv.export')}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="btn-secondary btn-sm flex-1"
        >
          <Upload size={14} />
          {importing ? t('csv.importing') : t('csv.import')}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </div>
      {message && <p className="hint">{message}</p>}
    </div>
  )
}
