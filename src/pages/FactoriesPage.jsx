import { useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import FactoryMap from '../components/Map/FactoryMap'
import MeasureButton from '../components/Map/MeasureButton'
import MeasurePanel from '../components/Map/MeasurePanel'
import FactoryList from '../components/Factory/FactoryList'
import SearchFilter from '../components/Factory/SearchFilter'
import CsvImportExport from '../components/Csv/CsvImportExport'
import FactoryForm from '../components/Factory/FactoryForm'
import Modal from '../components/common/Modal'
import { useFactories } from '../hooks/useFactories'
import { factoryPoint, portPoint, useMeasure, wantsPairs } from '../hooks/useMeasure'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { FOB_PORTS } from '../lib/ports'

export default function FactoriesPage() {
  const { user, isAdmin } = useAuth()
  const { t, tCount } = useI18n()
  const { factories, loading, error, createFactory, updateFactory, deleteFactory } = useFactories()

  const [query, setQuery] = useState('')
  const [province, setProvince] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [editingFactory, setEditingFactory] = useState(null)
  const [newFactoryCoords, setNewFactoryCoords] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const measure = useMeasure()

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

  const handleMapClick = (latlng) => {
    // While measuring, a click on empty map is a miss, not a new factory.
    if (measure.measuring) return

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

          <MeasureButton active={measure.measuring} onClick={measure.toggle} />
        </div>

        <FactoryMap
          factories={filteredFactories}
          onMapClick={handleMapClick}
          flyToTarget={flyTarget}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canManage={canManage}
          layoutKey={panelOpen}
          ports={FOB_PORTS}
          measuring={measure.measuring}
          measurePoints={measure.points}
          measureLegs={measure.legs}
          measureSelectedKeys={measure.selectedKeys}
          onMeasureFactory={(factory, event) =>
            measure.select(factoryPoint(factory), { comparePairs: wantsPairs(event) })
          }
          onMeasurePort={(port, event) =>
            measure.select(portPoint(port), { comparePairs: wantsPairs(event) })
          }
        />

        {/* The add-a-factory hint would be wrong while measuring, when a click
            on the map deliberately does nothing. */}
        {!measure.measuring && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/90 px-3.5 py-1.5 text-[12px] text-muted shadow-subtle backdrop-blur">
            {t('factories.clickMapHint')}
          </p>
        )}

        {measure.measuring && (
          <MeasurePanel
            points={measure.points}
            legs={measure.legs}
            totalKm={measure.totalKm}
            mode={measure.mode}
            onModeChange={measure.setMode}
            onUndo={measure.undo}
            onClear={measure.clear}
            onClose={measure.toggle}
            emptyHint={t('measure.selectFirstMixed')}
            nextHint={t('measure.selectNextMixed')}
          />
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
