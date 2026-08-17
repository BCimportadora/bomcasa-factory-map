import { useMemo, useState } from 'react'
import Navbar from '../components/Layout/Navbar'
import FactoryMap from '../components/Map/FactoryMap'
import FactoryList from '../components/Factory/FactoryList'
import SearchFilter from '../components/Factory/SearchFilter'
import CsvImportExport from '../components/Csv/CsvImportExport'
import FactoryForm from '../components/Factory/FactoryForm'
import Modal from '../components/common/Modal'
import { useFactories } from '../hooks/useFactories'
import { useAuth } from '../context/AuthContext'
import { Menu } from 'lucide-react'

export default function MapPage() {
  const { user, isAdmin } = useAuth()
  const { factories, loading, error, createFactory, updateFactory, deleteFactory } = useFactories()
  const [query, setQuery] = useState('')
  const [province, setProvince] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [editingFactory, setEditingFactory] = useState(null)
  const [newFactoryCoords, setNewFactoryCoords] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const canManage = (factory) => isAdmin || factory.created_by === user?.id

  const provinces = useMemo(() => [...new Set(factories.map((f) => f.province).filter(Boolean))].sort(), [factories])

  const filteredFactories = useMemo(() => {
    const q = query.trim().toLowerCase()
    return factories.filter((f) => {
      const matchesQuery = !q || [f.name, f.city, f.province, f.products].some((field) => field?.toLowerCase().includes(q))
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
    if (!confirm(`Delete "${factory.name}"? This cannot be undone.`)) return
    try {
      await deleteFactory(factory.id)
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
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
      setFormError(err.message)
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
    <div className="flex h-screen flex-col">
      <Navbar />
      <div className="relative flex flex-1 overflow-hidden">
        <aside
          className={`absolute z-[1100] h-full w-80 max-w-[85vw] flex-shrink-0 border-r bg-white transition-transform md:relative md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto">
            <SearchFilter query={query} onQueryChange={setQuery} province={province} onProvinceChange={setProvince} provinces={provinces} />
            <CsvImportExport factories={filteredFactories} onImport={handleCsvImport} />
            {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading factories...</p>
            ) : (
              <FactoryList factories={filteredFactories} onSelect={setFlyTarget} onEdit={handleEdit} onDelete={handleDelete} canManage={canManage} />
            )}
          </div>
        </aside>

        <button onClick={() => setSidebarOpen((o) => !o)} className="absolute left-2 top-2 z-[1101] rounded bg-white p-2 shadow md:hidden">
          <Menu size={20} />
        </button>

        <main className="relative flex-1">
          <FactoryMap
            factories={filteredFactories}
            onMapClick={handleMapClick}
            flyToTarget={flyTarget}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canManage={canManage}
          />
          <p className="absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-gray-600 shadow">
            Click anywhere on the map to add a factory
          </p>
        </main>
      </div>

      {(editingFactory || newFactoryCoords) && (
        <Modal title={editingFactory ? 'Edit factory' : 'Add factory'} onClose={closeForm}>
          {formError && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <FactoryForm initialValues={editingFactory ?? newFactoryCoords} onSubmit={handleFormSubmit} onCancel={closeForm} submitting={submitting} />
        </Modal>
      )}
    </div>
  )
}
