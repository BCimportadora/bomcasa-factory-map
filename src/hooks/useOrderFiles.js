import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STORAGE_BUCKET, filePath, mimeForFile } from '../lib/orderFiles'

/** How long a download link stays valid. Long enough to click, short enough not to leak. */
const SIGNED_URL_SECONDS = 60

/**
 * Upload a batch of files to one order and record the rows.
 *
 * The object goes to Storage first and the row second, so a failure between the
 * two leaves an object nobody can see rather than a row pointing at nothing -- a
 * row with no object renders as a file that cannot be downloaded, which looks
 * like data loss. Anything already uploaded when a later file fails is removed
 * again, or it would sit in the bucket forever.
 *
 * `upsert: false` so a key collision fails loudly instead of overwriting
 * somebody else's paperwork. The content type is derived from the extension,
 * not read from the browser -- see lib/orderFiles.js.
 *
 * Exported on its own, outside the hook, so the liquidation importer can attach
 * its source spreadsheet without mounting a second realtime subscription just to
 * make one call.
 */
export async function attachFilesToOrder(orderId, fileList, userId, docType = 'other') {
  const uploaded = []
  try {
    for (const file of [...fileList]) {
      const path = filePath(orderId, file)
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: mimeForFile(file), upsert: false })
      if (error) throw error
      uploaded.push({
        order_id: orderId,
        storage_path: path,
        file_name: file.name,
        mime_type: mimeForFile(file),
        size_bytes: file.size,
        doc_type: docType,
        created_by: userId,
      })
    }
  } catch (err) {
    if (uploaded.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(uploaded.map((row) => row.storage_path))
    }
    throw err
  }

  const { error } = await supabase.from('order_files').insert(uploaded)
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove(uploaded.map((row) => row.storage_path))
    throw error
  }
  return uploaded.length
}

/**
 * The files attached to orders.
 *
 * Loads every row rather than one order at a time: the Files section needs a
 * per-order count on the supplier page before anyone has opened an order, and
 * the whole table is a few hundred rows for a team this size. `filesFor` slices
 * it locally.
 *
 * Pass an order id to `useOrderFiles(orderId)` when only one order matters --
 * the order detail modal does -- and the same fetch is filtered server-side.
 */
export function useOrderFiles(orderId = null) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('order_files')
      .select('*')
      .order('created_at', { ascending: false })
    if (orderId) query = query.eq('order_id', orderId)

    const { data, error } = await query
    if (error) {
      setError(error.message)
    } else {
      setFiles(data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchFiles()

    const channel = supabase
      .channel(`order-files-changes${orderId ? `-${orderId}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_files' }, fetchFiles)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchFiles, orderId])

  const addFiles = async (targetOrderId, fileList, userId, docType = 'other') => {
    await attachFilesToOrder(targetOrderId, fileList, userId, docType)
    await fetchFiles()
  }

  /**
   * Remove one file, row first.
   *
   * The other order would leave a row whose object is gone, which is a
   * permanently broken download rather than a tidy absence.
   */
  const removeFile = async (file) => {
    const { error } = await supabase.from('order_files').delete().eq('id', file.id)
    if (error) throw error
    await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path])
    await fetchFiles()
  }

  /**
   * A short-lived link that downloads the object under its original name.
   *
   * The bucket is private, so there is no permanent URL to hand out. Supabase's
   * `download` option sets Content-Disposition server-side, which is what makes
   * the browser save `Milan_11_arancel.pdf` rather than a uuid. The bytes are
   * served untouched.
   */
  const signedUrlFor = async (file) => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS, { download: file.file_name })
    if (error) throw error
    return data.signedUrl
  }

  /** The files on one order, newest first. */
  const filesFor = useCallback(
    (id) => files.filter((file) => file.order_id === id),
    [files],
  )

  /** How many files each order has, keyed by order id. */
  const countByOrder = useCallback(() => {
    const counts = new Map()
    for (const file of files) {
      counts.set(file.order_id, (counts.get(file.order_id) ?? 0) + 1)
    }
    return counts
  }, [files])

  return {
    files,
    loading,
    error,
    addFiles,
    removeFile,
    signedUrlFor,
    filesFor,
    countByOrder,
    refetch: fetchFiles,
  }
}
