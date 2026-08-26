import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { MAX_IMAGE_BYTES, isAllowedImage } from '../../lib/innovations'
import InnovationImage from './InnovationImage'

/**
 * Add and remove the pictures on one innovation.
 *
 * Uploads happen immediately rather than on form submit: the files go to
 * Storage and the rows to Postgres, which are two round trips that should not
 * be hiding behind a Save button the user might never press.
 */
export default function ImageUploader({ images, onAdd, onRemove, disabled = false }) {
  const { t } = useI18n()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFiles = async (event) => {
    const files = [...(event.target.files ?? [])]
    // Let the same file be chosen again after a failure.
    event.target.value = ''
    if (files.length === 0) return

    setError('')
    const tooBig = files.find((file) => file.size > MAX_IMAGE_BYTES)
    if (tooBig) {
      setError(t('innovations.imageTooLarge', { name: tooBig.name }))
      return
    }
    const wrongType = files.find((file) => !isAllowedImage(file))
    if (wrongType) {
      setError(t('innovations.imageWrongType', { name: wrongType.name }))
      return
    }

    setBusy(true)
    try {
      await onAdd(files)
    } catch (err) {
      setError(err.message ?? t('innovations.imageUploadError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (image) => {
    setError('')
    try {
      await onRemove(image)
    } catch (err) {
      setError(err.message ?? t('innovations.imageRemoveError'))
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label mb-0">{t('innovations.images')}</span>
        <span className="hint">{t('innovations.imagesHint')}</span>
      </div>

      {error && (
        <p role="alert" className="alert-error mb-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image) => (
          <div key={image.id} className="group relative">
            <InnovationImage path={image.storage_path} alt="" ratio="aspect-square" />
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(image)}
                aria-label={t('innovations.removeImage')}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <ImagePlus size={20} strokeWidth={1.75} />
            )}
            <span className="text-[11px] font-medium">
              {busy ? t('common.saving') : t('innovations.addImage')}
            </span>
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
    </div>
  )
}
