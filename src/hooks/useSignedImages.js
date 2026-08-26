import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STORAGE_BUCKET } from '../lib/innovations'

/**
 * How long a signed URL stays valid. Long enough that a page left open over a
 * lunch break still shows its pictures, short enough that a URL copied out of
 * devtools stops working the same day.
 */
const TTL_SECONDS = 60 * 60

/** Re-sign a little before expiry rather than after a user hits a broken image. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/** path -> { url, expiresAt } */
const cache = new Map()

/**
 * Paths waiting to be signed, and the promise that will sign them.
 *
 * Every card on the board mounts its own image component, so without this each
 * one would issue its own request on first paint -- forty cards, forty round
 * trips, all in the same tick. Collecting them and signing once at the end of
 * the tick turns that into a single call. The batch is keyed by path, so two
 * components asking for the same picture also collapse into one.
 */
let queued = new Set()
let flushing = null

const flush = () => {
  if (flushing) return flushing
  flushing = new Promise((resolve) => {
    setTimeout(async () => {
      const paths = [...queued]
      queued = new Set()
      flushing = null
      if (paths.length === 0) {
        resolve()
        return
      }
      const signedAt = Date.now()
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(paths, TTL_SECONDS)
      if (!error && data) {
        for (const entry of data) {
          // createSignedUrls echoes the path back on every result, so one
          // failure in the middle cannot shift the others out of alignment.
          if (!entry.signedUrl || entry.error) continue
          cache.set(entry.path, {
            url: entry.signedUrl,
            expiresAt: signedAt + TTL_SECONDS * 1000,
          })
        }
      }
      resolve()
    }, 0)
  })
  return flushing
}

const request = (paths) => {
  for (const path of paths) queued.add(path)
  return flush()
}

const fresh = (path, now) => {
  const hit = cache.get(path)
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > now ? hit.url : null
}

/**
 * Resolve storage paths to displayable URLs.
 *
 * The innovations bucket is private, so there is no permanent public URL to
 * store: every image has to be signed for the person looking at it.
 */
export function useSignedImages(paths) {
  const [urls, setUrls] = useState({})
  // The array identity changes every render; its contents rarely do.
  const key = paths.join('|')

  useEffect(() => {
    let cancelled = false
    const wanted = key ? key.split('|') : []
    if (wanted.length === 0) {
      setUrls({})
      return undefined
    }

    const resolve = async () => {
      const now = Date.now()
      const missing = wanted.filter((path) => !fresh(path, now))
      if (missing.length > 0) await request(missing)
      if (cancelled) return

      const after = Date.now()
      setUrls(
        Object.fromEntries(
          wanted.map((path) => [path, fresh(path, after)]).filter(([, url]) => url),
        ),
      )
    }

    resolve()
    // Signed URLs expire; a board left open all afternoon would go blank.
    const timer = setInterval(resolve, TTL_SECONDS * 1000 - REFRESH_MARGIN_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [key])

  return urls
}

/** Convenience for a single image. */
export function useSignedImage(path) {
  const urls = useSignedImages(path ? [path] : [])
  return path ? (urls[path] ?? null) : null
}
