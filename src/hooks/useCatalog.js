import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { codeKey } from '../lib/catalog'

/**
 * Write a catalog import that has already been planned.
 *
 * Order matters. The products go in first, as a single bulk insert that
 * Postgres runs as one statement -- so that step is genuinely all-or-nothing.
 * The import record goes in second: if it fails, the products are already there
 * and re-importing skips them as existing and records the document that time,
 * which self-corrects. The other order would mark a document imported whose
 * products never arrived, and the unique `doc_key` would then refuse the retry.
 *
 * Exported outside the hook so the Orders importer can push the same cost sheet
 * into the catalog without mounting a second realtime subscription to do it.
 */
export async function applyCatalogImport({ plan, document, userId }) {
  const inserted = []

  if (plan.added.length > 0) {
    const rows = plan.added.map(({ key, fields }) => ({
      code_key: key,
      product_code: fields.product_code || null,
      description: fields.description ?? null,
      fob_usd: fields.fob_usd ?? null,
      arancel: fields.arancel ?? null,
      gravamen_pct: fields.gravamen_pct ?? null,
      barcode: fields.barcode ?? null,
      supplier_code: fields.supplier_code ?? null,
      model: fields.model ?? null,
      description_en: fields.description_en ?? null,
      description_es: fields.description_es ?? null,
      unit_price_dop: fields.unit_price_dop ?? null,
      precio_lista: fields.precio_lista ?? null,
      // Only a cost sheet knows this, so it stays null for a product a
      // liquidación or a proforma introduced -- null being "nobody has said".
      internal_use: fields.internal_use ?? null,
      // ...and only a proforma knows these two.
      cbm_unit: fields.cbm_unit ?? null,
      units_per_box: fields.units_per_box ?? null,
      doc_date: fields.doc_date ?? null,
      cost_date: fields.cost_date ?? null,
      doc_ref: fields.doc_ref ?? null,
      cost_ref: fields.cost_ref ?? null,
      created_by: userId,
    }))
    const { data, error } = await supabase.from('catalog').insert(rows).select('id')
    if (error) throw error
    inserted.push(...(data ?? []).map((r) => r.id))
  }

  // Enrichment, guarded so the plan cannot be applied to a product that changed
  // underneath it.
  //
  // Filling a blank is guarded per field with `.is(field, null)`: if another tab
  // filled it since the plan was made, the update matches nothing rather than
  // clobbering it.
  //
  // Replacing a value cannot use that guard -- it would block every legitimate
  // overwrite, which is exactly what "the newest order wins" needs to do. The
  // plan decided from a list read moments earlier and a person confirmed it.
  const enriched = []
  for (const row of plan.updated) {
    for (const [field, value] of Object.entries(row.fills ?? {})) {
      let query = supabase.from('catalog').update({ [field]: value }).eq('id', row.id)
      // `code_key` is never null — an uncoded entry has a description-derived
      // one — so adopting a real code cannot use the was-blank guard.
      if (field !== 'code_key' && field !== 'product_code') query = query.is(field, null)
      const { error } = await query
      if (error) throw error
    }

    const refreshes = row.refreshes ?? {}
    if (Object.keys(refreshes).length > 0) {
      const { error } = await supabase.from('catalog').update(refreshes).eq('id', row.id)
      if (error) throw error
    }

    enriched.push(row.id)
  }

  const { data: record, error: recordError } = await supabase
    .from('catalog_imports')
    .insert({ ...document, created_by: userId })
    .select()
    .single()
  if (recordError) throw recordError

  const touched = [...new Set([...inserted, ...enriched])]
  if (touched.length > 0) {
    const { error } = await supabase
      .from('catalog_sources')
      .insert(touched.map((id) => ({ catalog_id: id, import_id: record.id })))
    // Provenance is worth having but not worth failing an import that already
    // succeeded, so this one is reported rather than thrown.
    if (error) console.error('catalog_sources:', error.message)
  }

  return record
}

/**
 * The product catalog and the documents it was built from.
 *
 * The whole table is loaded rather than paged from the server: search runs
 * across code, description and barcode at once, filters combine freely, and a
 * few thousand rows of reference data are cheaper to hold than to re-query on
 * every keystroke. Paging happens in the page component, over the filtered set.
 */
export function useCatalog() {
  const [products, setProducts] = useState([])
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: rows, error: rowsError }, { data: docs, error: docsError }] = await Promise.all([
      supabase.from('catalog').select('*').order('code_key'),
      supabase.from('catalog_imports').select('*').order('created_at', { ascending: false }),
    ])
    if (rowsError || docsError) {
      setError((rowsError ?? docsError).message)
    } else {
      setProducts(rows ?? [])
      setImports(docs ?? [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('catalog-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_imports' }, fetchAll)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchAll])

  /**
   * The current rows straight from the database.
   *
   * An import decides whether a product already exists, and answering that from
   * subscription-backed state re-inserts everything the state has not caught up
   * with yet. Display may lag; identity may not.
   */
  const listProducts = async () => {
    const { data, error } = await supabase.from('catalog').select('*')
    if (error) throw error
    return data ?? []
  }

  /** Has this document already been read? Asked of the database, not of state. */
  const findImport = async (docKey) => {
    const { data, error } = await supabase
      .from('catalog_imports')
      .select('*')
      .eq('doc_key', docKey)
      .maybeSingle()
    if (error) throw error
    return data ?? null
  }

  /**
   * Write an import that has already been planned and validated.
   *
   * Order matters. The products go in first, as a single bulk insert that
   * Postgres runs as one statement — so that step is genuinely all-or-nothing.
   * The import record goes in second: if it fails, the products are already
   * there and re-importing skips them as existing and records the document that
   * time, which self-corrects. The other order would mark a document imported
   * whose products never arrived, and the unique `doc_key` would then refuse
   * the retry.
   */
  const applyImport = async ({ plan, document, userId }) => {
    const record = await applyCatalogImport({ plan, document, userId })
    await fetchAll()
    return record
  }

  const updateProduct = async (id, fields) => {
    const payload = { ...fields }
    if (payload.product_code) payload.code_key = codeKey(payload.product_code)
    const { data, error } = await supabase
      .from('catalog')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await fetchAll()
    return data
  }

  /**
   * Remove one product.
   *
   * Administrators only, and enforced by the delete policy in schema.sql, not
   * by hiding the button -- the anon key is public, so PostgREST would take the
   * request straight from anyone's browser otherwise. `catalog_sources` follows
   * on its cascade, so the record of which documents mentioned this product
   * goes with it; the `catalog_imports` rows stay, because a document was still
   * read even after one of its products is removed.
   */
  const deleteProduct = async (id) => {
    const { error: deleteError } = await supabase.from('catalog').delete().eq('id', id)
    if (deleteError) throw deleteError
    await fetchAll()
  }

  /**
   * Empty the catalog: every product and every record of a document read.
   *
   * Both, not just the products. Leaving the import records behind would mean
   * every document was still marked as already imported, so a cleared catalog
   * could not be rebuilt from the same files -- which is the only reason to
   * clear it. `catalog_sources` follows on its cascade.
   *
   * Administrators only, and that is enforced by the delete policies in
   * schema.sql rather than by hiding the button.
   *
   * PostgREST refuses an unfiltered delete, so the filter matches everything
   * explicitly rather than by omission.
   */
  const clearCatalog = async () => {
    const { error: productsError } = await supabase.from('catalog').delete().not('id', 'is', null)
    if (productsError) throw productsError

    const { error: importsError } = await supabase
      .from('catalog_imports')
      .delete()
      .not('id', 'is', null)
    if (importsError) throw importsError

    await fetchAll()
  }

  /** Which documents a product came from. */
  const sourcesFor = async (catalogId) => {
    const { data, error } = await supabase
      .from('catalog_sources')
      .select('import_id, catalog_imports(*)')
      .eq('catalog_id', catalogId)
    if (error) throw error
    return (data ?? []).map((r) => r.catalog_imports).filter(Boolean)
  }

  return {
    products,
    imports,
    loading,
    error,
    listProducts,
    findImport,
    applyImport,
    updateProduct,
    deleteProduct,
    clearCatalog,
    sourcesFor,
    refetch: fetchAll,
  }
}
