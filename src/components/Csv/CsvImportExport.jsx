import { useRef, useState } from 'react'
import { exportFactoriesToCsv, parseFactoriesCsv } from '../../lib/csv'

export default function CsvImportExport({ factories, onImport }) {
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
      if (validRows.length > 0) {
        await onImport(validRows)
      }
      setMessage(`Imported ${validRows.length} of ${rows.length} rows.` + (errors.length ? ` ${errors.length} skipped.` : ''))
    } catch (err) {
      setMessage(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2 border-b p-4">
      <div className="flex gap-2">
        <button
          onClick={() => exportFactoriesToCsv(factories)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Import CSV'}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </div>
      {message && <p className="text-xs text-gray-500">{message}</p>}
    </div>
  )
}
