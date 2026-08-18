import { Link } from 'react-router-dom'

/** Centred status screen used for loading, access denied and not-found states. */
export default function FullScreenMessage({ title, children, action }) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center bg-canvas px-6">
      <div className="text-center">
        {title && <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>}
        <p className={`text-[15px] text-muted ${title ? 'mt-2' : ''}`}>{children}</p>
        {action && (
          <Link to={action.to} className="btn-secondary mt-5">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  )
}
