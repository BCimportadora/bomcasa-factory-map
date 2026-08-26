import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STORAGE_BUCKET, imagePath } from '../lib/innovations'

/** Columns that live on `innovations`. Anything else on a form value is ignored. */
const INNOVATION_COLUMNS = [
  'name',
  'label',
  'assigned_to',
  'local_price',
  'local_currency',
  'local_price_notes',
  'fob_price',
  'fob_currency',
  'planned_units',
  'notes',
]

const NUMERIC_COLUMNS = new Set(['local_price', 'fob_price', 'planned_units', 'quoted_price'])
/** A foreign key left unselected must go to the database as null, not ''. */
const UUID_COLUMNS = new Set(['assigned_to', 'factory_id', 'variation_id'])

const clean = (value, column) => {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  if (trimmed === '') return NUMERIC_COLUMNS.has(column) || UUID_COLUMNS.has(column) ? null : ''
  if (NUMERIC_COLUMNS.has(column)) {
    const parsed = parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return trimmed
}

const payload = (values, columns) =>
  Object.fromEntries(columns.filter((c) => c in values).map((c) => [c, clean(values[c], c)]))

const byLine = (a, b) => (a.line_no ?? 0) - (b.line_no ?? 0)

/** Children come back in whatever order Postgres finds them; impose our own. */
const sortChildren = (innovation) => ({
  ...innovation,
  innovation_images: [...(innovation.innovation_images ?? [])].sort(byLine),
  innovation_variations: [...(innovation.innovation_variations ?? [])].sort(byLine),
  innovation_quotes: [...(innovation.innovation_quotes ?? [])].sort(byLine),
})

const SELECT = '*, innovation_images(*), innovation_variations(*), innovation_quotes(*)'

export function useInnovations() {
  const [innovations, setInnovations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchInnovations = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('innovations')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setInnovations((data ?? []).map(sortChildren))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInnovations()

    // The child tables are watched too: adding a quote without touching the
    // parent row would otherwise leave other tabs showing stale prices.
    const channel = supabase
      .channel('innovations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'innovations' }, fetchInnovations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_images' }, fetchInnovations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_variations' }, fetchInnovations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_quotes' }, fetchInnovations)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchInnovations])

  const createInnovation = async (values) => {
    const { data, error } = await supabase
      .from('innovations')
      .insert(payload(values, [...INNOVATION_COLUMNS, 'created_by']))
      .select()
      .single()
    if (error) throw error
    await fetchInnovations()
    return data
  }

  const updateInnovation = async (id, values) => {
    const { data, error } = await supabase
      .from('innovations')
      .update(payload(values, INNOVATION_COLUMNS))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await fetchInnovations()
    return data
  }

  /** Anyone may retag an item; that is the point of a shared board. */
  const setLabel = async (id, label) => {
    const { error } = await supabase.from('innovations').update({ label }).eq('id', id)
    if (error) throw error
    await fetchInnovations()
  }

  /**
   * Move an item between the two sections. The database refuses this for
   * non-administrators and for items that are not labelled done, so a failure
   * here is a real answer rather than something to work around.
   */
  const setStage = async (id, stage) => {
    const { error } = await supabase.from('innovations').update({ stage }).eq('id', id)
    if (error) throw error
    await fetchInnovations()
  }

  const deleteInnovation = async (id, images = []) => {
    // Remove the files first. The rows go with the parent by cascade, and an
    // orphaned row is recoverable while an orphaned 10 MB object is not.
    const paths = images.map((image) => image.storage_path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(paths)
    }
    const { error } = await supabase.from('innovations').delete().eq('id', id)
    if (error) throw error
    await fetchInnovations()
  }

  // --- images -------------------------------------------------------------

  const addImages = async (innovationId, files, userId, startAt = 0) => {
    const uploaded = []
    try {
      for (const [index, file] of [...files].entries()) {
        const path = imagePath(innovationId, file)
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
        uploaded.push({
          innovation_id: innovationId,
          storage_path: path,
          line_no: startAt + index,
          created_by: userId,
        })
      }
    } catch (err) {
      // Objects already uploaded in this batch have no row pointing at them;
      // without this they would sit in the bucket forever.
      if (uploaded.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploaded.map((row) => row.storage_path))
      }
      throw err
    }

    const { error } = await supabase.from('innovation_images').insert(uploaded)
    if (error) {
      await supabase.storage.from(STORAGE_BUCKET).remove(uploaded.map((row) => row.storage_path))
      throw error
    }
    await fetchInnovations()
  }

  const removeImage = async (image) => {
    const { error } = await supabase.from('innovation_images').delete().eq('id', image.id)
    if (error) throw error
    // Only after the row is gone: a deleted object with a surviving row renders
    // as a permanently broken image.
    await supabase.storage.from(STORAGE_BUCKET).remove([image.storage_path])
    await fetchInnovations()
  }

  // --- variations and quotes ----------------------------------------------

  /**
   * Save variations and quotes together, in that order.
   *
   * They cannot be saved independently: a quote on a variation added in this
   * session has nothing to point at until that variation has an id. The editor
   * therefore tags each quote with the variation's temporary `key`, and this
   * translates those keys into real ids once the variations come back.
   *
   * Variations are upserted rather than deleted and recreated, because their
   * ids are what the quotes reference -- recreating them would cascade every
   * quote away.
   */
  const saveDetails = async (innovationId, variations, quotes, previous = {}) => {
    const wanted = variations.filter((variation) => variation.name?.trim())

    const rows = wanted.map((variation, index) => ({
      ...(variation.id ? { id: variation.id } : {}),
      innovation_id: innovationId,
      name: variation.name.trim(),
      notes: clean(variation.notes, 'notes'),
      line_no: index,
    }))

    let saved = []
    if (rows.length > 0) {
      const { data, error } = await supabase.from('innovation_variations').upsert(rows).select()
      if (error) throw error
      saved = data ?? []
    }

    // line_no is unique within this save, so it is a safe join key -- the
    // order rows come back in is not guaranteed.
    const idByLine = new Map(saved.map((row) => [row.line_no, row.id]))
    const idByKey = new Map(
      wanted.map((variation, index) => [variation.key, variation.id ?? idByLine.get(index)]),
    )

    const keptVariations = new Set(saved.map((row) => row.id))
    const staleVariations = (previous.variations ?? [])
      .filter((variation) => !keptVariations.has(variation.id))
      .map((variation) => variation.id)
    if (staleVariations.length > 0) {
      const { error } = await supabase
        .from('innovation_variations')
        .delete()
        .in('id', staleVariations)
      if (error) throw error
    }

    const quoteRows = quotes
      .filter((quote) => quote.factory_id || String(quote.quoted_price ?? '').trim())
      .map((quote, index) => ({
        ...(quote.id ? { id: quote.id } : {}),
        innovation_id: innovationId,
        variation_id: quote.variation_key ? (idByKey.get(quote.variation_key) ?? null) : null,
        factory_id: clean(quote.factory_id, 'factory_id'),
        safety: quote.safety ?? 'unknown',
        quoted_price: clean(quote.quoted_price, 'quoted_price'),
        currency: quote.currency ?? 'USD',
        notes: clean(quote.notes, 'notes'),
        line_no: index,
      }))

    let savedQuotes = []
    if (quoteRows.length > 0) {
      const { data, error } = await supabase.from('innovation_quotes').upsert(quoteRows).select()
      if (error) throw error
      savedQuotes = data ?? []
    }

    const keptQuotes = new Set(savedQuotes.map((row) => row.id))
    const staleQuotes = (previous.quotes ?? [])
      .filter((quote) => !keptQuotes.has(quote.id))
      .map((quote) => quote.id)
    if (staleQuotes.length > 0) {
      const { error } = await supabase.from('innovation_quotes').delete().in('id', staleQuotes)
      if (error) throw error
    }

    await fetchInnovations()
  }

  return {
    innovations,
    loading,
    error,
    createInnovation,
    updateInnovation,
    setLabel,
    setStage,
    deleteInnovation,
    addImages,
    removeImage,
    saveDetails,
    refetch: fetchInnovations,
  }
}
