import { useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Ruler, X } from 'lucide-react'
import FactoryMap from '../components/Map/FactoryMap'
import FactoryList from '../components/Factory/FactoryList'
import SearchFilter from '../components/Factory/SearchFilter'
import CsvImportExport from '../components/Csv/CsvImportExport'
import FactoryForm from '../components/Factory/FactoryForm'
import Modal from '../components/common/Modal'
import { useFactories } from '../hooks/useFactories'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { formatDistance, pathLegs, pathLengthKm } from '../lib/distance'

export default function FactoriesPage() {
  const { user, isAdmin } = useAuth()
  const { t, tCount, language } = useI18n()
  const { factories, loading, error, createFactory, updateFactory, deleteFactory } = useFactories()

  const [query, setQuery] = useState('')
  const [province, setProvince] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [editingFactory, setEditingFactory] = useState(null)
  const [newFactoryCoords, setNewFactoryCoords] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [measuring, setMeasuring] = useState(false)
  const [measurePoints, setMeasurePoints] = useState([])

  const canManage = (factory) => isAdmin || factory.created_by === user?.id

  const provinces = useMemo(
    () => [...new Set(factories.map((f) => f.province).filter(Boolean))].sort(),
    [factories],
  )

  const filteredFactories = useMemo(() => {
    const q = query.trim().toLowerCase()
    return factories.filter((f) => {
      const matchesQuery =
        !q || [f.name, f.city, f.province, f.products].some((field) => field?.toLowerCase().includes(q))
      const matchesProvince = !province || f.province === province
      return matchesQuery && matchesProvince
    })
  }, [factories, query, province])

  const measureLegs = useMemo(() => pathLegs(measurePoints), [measurePoints])
  const measureTotalKm = useMemo(() => pathLengthKm(measurePoints), [measurePoints])

  const toggleMeasuring = () => {
    setMeasuring((on) => !on)
    setMeasurePoints([])
  }

  const handleMeasureSelect = (factory) => {
    setMeasurePoints((points) => {
      // Ignore a repeat of the stop just added: it would contribute a leg of
      // zero and read as a stutter in the list.
      const last = points[points.length - 1]
      return last?.id === factory.id ? points : [...points, factory]
    })
  }

  const handleMapClick = (latlng) => {
    // While measuring, a click on empty map is a miss, not a new factory.
    if (measuring) return

    setFormError('')
    setEditingFactory(null)
    setNewFactoryCoords({ latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) })
  }

  const handleEdit = (factory) => {
    setFormError('')
    setNewFactoryCoords(null)
    setEditingFactory(factory)
  }

  const handleDelete = async (factory) => {
    if (!confirm(t('factories.deleteConfirm', { name: factory.name }))) return
    try {
      await deleteFactory(factory.id)
    } catch (err) {
      console.error('Delete failed:', err)
      alert(t('factories.deleteError'))
    }
  }

  const closeForm = () => {
    setEditingFactory(null)
    setNewFactoryCoords(null)
    setFormError('')
  }

  const handleFormSubmit = async (values) => {
    setSubmitting(true)
    setFormError('')
    try {
      if (editingFactory) {
        await updateFactory(editingFactory.id, values)
      } else {
        await createFactory({ ...values, created_by: user.id })
      }
      closeForm()
    } catch (err) {
      console.error('Save failed:', err)
      setFormError(t('factories.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCsvImport = async (rows) => {
    for (const row of rows) {
      await createFactory({ ...row, created_by: user.id })
    }
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Backdrop for the small-screen overlay; absent on md+ where the panel
          is part of the flex flow. */}
      {panelOpen && (
        <div
          className="absolute inset-0 z-[1050] scrim md:hidden"
          onClick={() => setPanelOpen(false)}
          role="presentation"
        />
      )}

      <aside
        /* Below md the panel floats over the map. From md it is a real flex
           child, and a flex item's size comes from flex-basis rather than
           width — so collapsing it to a zero basis is what actually hands the
           space back to the map. min-w-0 stops the default min-width:auto
           holding it open at its content width. AutoResize then re-measures
           the map. */
        className={`absolute inset-y-0 left-0 z-[1100] flex w-80 min-w-0 max-w-[85vw] flex-col overflow-hidden border-r border-line bg-surface transition-transform duration-200 md:relative md:max-w-none ${
          panelOpen ? 'translate-x-0' : '-translate-x-full md:border-r-0'
        }`}
        /* The desktop size is set inline rather than with a utility class: as a
           flex item the panel is sized by flex-basis, and an inline value cannot
           be outranked by the `w-80` needed for the mobile overlay. Below md the
           panel is absolutely positioned, where flex has no effect. */
        style={{ flex: panelOpen ? '0 0 20rem' : '0 0 0px' }}
        aria-hidden={!panelOpen}
      >
        {/* Fixed width so the contents do not reflow while the panel animates. */}
        <div className="flex h-full w-80 max-w-[85vw] flex-col md:max-w-none">
          <div className="border-b border-line px-5 pb-3 pt-5">
            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {t('factories.title')}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {loading ? t('common.loading') : tCount('factories.count', filteredFactories.length)}
            </p>
          </div>

          <SearchFilter
            query={query}
            onQueryChange={setQuery}
            province={province}
            onProvinceChange={setProvince}
            provinces={provinces}
          />
          <CsvImportExport factories={filteredFactories} onImport={handleCsvImport} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && <p className="alert-error m-4">{t('factories.loadError')}</p>}
            {loading ? (
              <p className="px-5 py-8 text-center text-[14px] text-muted">{t('factories.loading')}</p>
            ) : (
              <FactoryList
                factories={filteredFactories}
                onSelect={setFlyTarget}
                onEdit={handleEdit}
                onDelete={handleDelete}
                canManage={canManage}
              />
            )}
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        {/* Top-left is reserved for these controls; the map's zoom buttons are
            pinned to the top-right so the two can never collide. */}
        <div className="absolute left-3 top-3 z-[1101] flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? t('factories.hidePanel') : t('factories.showPanel')}
            title={panelOpen ? t('factories.hidePanel') : t('factories.showPanel')}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface/95 px-2.5 py-2 text-muted shadow-subtle backdrop-blur transition-colors hover:text-ink"
          >
            {panelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            {!panelOpen && (
              <span className="text-[13px] font-medium">{t('factories.showPanelShort')}</span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleMeasuring}
            aria-pressed={measuring}
            title={measuring ? t('measure.stop') : t('measure.start')}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-subtle backdrop-blur transition-colors ${
              measuring
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-surface/95 text-muted hover:text-ink'
            }`}
          >
            <Ruler size={17} />
            <span className="text-[13px] font-medium">
              {measuring ? t('measure.stop') : t('measure.start')}
            </span>
          </button>
        </div>

        <FactoryMap
          factories={filteredFactories}
          onMapClick={handleMapClick}
          flyToTarget={flyTarget}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canManage={canManage}
          layoutKey={panelOpen}
          measuring={measuring}
          measurePoints={measurePoints}
          onMeasureSelect={handleMeasureSelect}
        />

        {/* The add-a-factory hint would be wrong while measuring, when a click
            on the map deliberately does nothing. */}
        {!measuring && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/90 px-3.5 py-1.5 text-[12px] text-muted shadow-subtle backdrop-blur">
            {t('factories.clickMapHint')}
          </p>
        )}

        {measuring && (
          <div className="absolute bottom-4 left-3 z-[1101] w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-surface/95 p-4 shadow-panel backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{t('measure.title')}</p>
                <p className="text-[12px] text-muted">{t('measure.straightLine')}</p>
              </div>
              <button
                type="button"
                onClick={toggleMeasuring}
                aria-label={t('measure.stop')}
                className="-mr-1 -mt-1 flex-shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {measureLegs.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                {measurePoints.length === 0 ? t('measure.selectFirst') : t('measure.selectNext')}
              </p>
            ) : (
              <>
                <ol className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
                  {measureLegs.map((leg, index) => (
                    <li
                      key={`${leg.from.id}-${leg.to.id}-${index}`}
                      className="flex items-baseline justify-between gap-3 text-[13px]"
                    >
                      <span className="min-w-0 truncate text-muted">
                        {leg.from.name} → {leg.to.name}
                      </span>
                      <span className="flex-shrink-0 tabular-nums text-ink">
                        {formatDistance(leg.km, language)}
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                  <span className="text-[13px] font-medium text-ink">{t('measure.total')}</span>
                  <span className="text-[15px] font-semibold tabular-nums text-ink">
                    {formatDistance(measureTotalKm, language)}
                  </span>
                </div>
              </>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setMeasurePoints((points) => points.slice(0, -1))}
                disabled={measurePoints.length === 0}
                className="btn-secondary btn-sm flex-1"
              >
                {t('measure.undo')}
              </button>
              <button
                type="button"
                onClick={() => setMeasurePoints([])}
                disabled={measurePoints.length === 0}
                className="btn-secondary btn-sm flex-1"
              >
                {t('measure.clear')}
              </button>
            </div>
          </div>
        )}
      </main>

      {(editingFactory || newFactoryCoords) && (
        <Modal
          title={editingFactory ? t('factories.editTitle') : t('factories.addTitle')}
          onClose={closeForm}
        >
          {formError && <p className="alert-error mb-4">{formError}</p>}
          <FactoryForm
            initialValues={editingFactory ?? newFactoryCoords}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            submitting={submitting}
          />
        </Modal>
      )}
    </div>
  )
}
