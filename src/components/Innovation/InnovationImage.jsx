import { ImageOff } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useSignedImage } from '../../hooks/useSignedImages'

/**
 * One image out of the private bucket.
 *
 * There is no permanent URL to fall back on, so until the signed URL arrives
 * this renders a quiet placeholder rather than a broken-image icon. An item
 * with no picture at all uses the same placeholder, because a card with a hole
 * in it reads as a bug.
 */
export default function InnovationImage({ path, alt, className = '', ratio = 'aspect-[4/3]' }) {
  const { t } = useI18n()
  const url = useSignedImage(path)

  if (!path || !url) {
    return (
      <div
        className={`${ratio} flex w-full items-center justify-center rounded-xl bg-canvas ${className}`}
        aria-label={path ? t('innovations.imageLoading') : t('innovations.noImage')}
      >
        <ImageOff size={22} strokeWidth={1.5} className="text-muted/60" />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={`${ratio} w-full rounded-xl object-cover ${className}`}
    />
  )
}
