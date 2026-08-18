import { useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import FactoryMap from '../components/Map/FactoryMap'
import FactoryList from '../components/Factory/FactoryList'
import SearchFilter from '../components/Factory/SearchFilter'
import CsvImportExport from '../components/Csv/CsvImportExport'
import FactoryForm from '../components/Factory/FactoryForm'
import Modal from '../components/common/Modal'
import { useFactories } from '../hooks/useFactories'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'

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
    <div className="relative flex h-full">
      <aside
        className={`absolute inset-y-0 left-0 z-[1100] flex w-80 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-200 md:relative md:w-80 md:max-w-none ${
          panelOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <div className="border-b border-line px-5 pb-3 pt-5">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t('factories.title')}</h1>
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
      </aside>

      <main className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label={panelOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          className="absolute left-3 top-3 z-[1101] rounded-xl border border-line bg-surface p-2 text-muted shadow-subtle transition-colors hover:text-ink"
        >
          {panelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>

        <FactoryMap
          factories={filteredFactories}
          onMapClick={handleMapClick}
          flyToTarget={flyTarget}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canManage={canManage}
        />

        <p className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/90 px-3.5 py-1.5 text-[12px] text-muted shadow-subtle backdrop-blur">
          {t('factories.clickMapHint')}
        </p>
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
