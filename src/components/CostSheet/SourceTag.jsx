import { AlertCircle, FileSpreadsheet, Pencil } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * Where a field's value came from -- or that nothing supplied it.
 *
 * This is the whole reason the form is worth using rather than a blank
 * template. Nine of these fields can be read out of the uploaded workbook and
 * five usually cannot, and unless the two are told apart at a glance somebody
 * will accept a figure the file never stated. So: a prefilled field names its
 * file, sheet and cell; a typed one says so; and one nobody has filled is
 * marked, in the warning colour, as missing.
 */
export default function SourceTag({ source, missing = false, edited = false }) {
  const { t } = useI18n()

  if (missing) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-warning">
        <AlertCircle size={12} strokeWidth={2.2} />
        {t('costSheet.source.missing')}
      </span>
    )
  }

  if (edited || !source?.cell) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-muted">
        <Pencil size={12} strokeWidth={2} />
        {t('costSheet.source.typed')}
      </span>
    )
  }

  // The file name is the long part and the least useful once you are looking at
  // one document, so it is the part that truncates.
  return (
    <span
      className="mt-1 flex items-center gap-1 text-[12px] text-muted"
      title={[source.file, source.sheet, source.cell].filter(Boolean).join(' › ')}
    >
      <FileSpreadsheet size={12} strokeWidth={2} className="flex-shrink-0" />
      <span className="min-w-0 truncate">{source.file}</span>
      <span className="flex-shrink-0 whitespace-nowrap">
        › {source.sheet} › {source.cell}
      </span>
    </span>
  )
}
