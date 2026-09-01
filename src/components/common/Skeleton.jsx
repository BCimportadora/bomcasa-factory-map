/**
 * Placeholders for data that has not arrived.
 *
 * These stand in the shape of the thing that is coming — a table keeps its
 * columns, a card list keeps its cards — so the page does not jump when the
 * rows land. A centred spinner cannot do that, which is why the pages that
 * showed one now show these instead.
 *
 * `aria-hidden` on the bars, and one `role="status"` on the wrapper: a screen
 * reader should hear "loading", not forty empty boxes.
 */

/** A table of `rows` × `cols` grey bars, headers included. */
export function TableSkeleton({ rows = 8, cols = 5, label }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="overflow-hidden rounded-xl border border-line"
    >
      <div className="flex gap-3 border-b border-line px-3 py-2.5" aria-hidden="true">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className={`skeleton h-3 ${i === 1 ? 'flex-[3]' : 'flex-1'}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 border-b border-line px-3 py-2.5 last:border-0" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className={`skeleton h-3 ${c === 1 ? 'flex-[3]' : 'flex-1'}`}
              // A little variety, so it reads as text rather than as a grid of
              // identical blocks. Deterministic, or every render would reshuffle.
              style={{ opacity: 1 - ((r + c) % 3) * 0.15 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A stack of card outlines, for the lists that are cards rather than tables. */
export function CardSkeleton({ count = 4, label }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card card-pad" aria-hidden="true">
          <div className="skeleton h-3.5 w-40" />
          <div className="skeleton mt-2.5 h-3 w-64 max-w-full" />
          <div className="skeleton mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
