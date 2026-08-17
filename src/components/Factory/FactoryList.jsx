export default function FactoryList({ factories, onSelect, onEdit, onDelete, canManage }) {
  if (factories.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-500">No factories found.</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {factories.map((f) => (
        <li key={f.id} className="px-4 py-3 hover:bg-gray-50">
          <button onClick={() => onSelect(f)} className="block w-full text-left">
            <p className="font-medium text-gray-800">{f.name}</p>
            <p className="text-sm text-gray-500">{[f.city, f.province].filter(Boolean).join(', ') || '—'}</p>
            {f.products && <p className="truncate text-xs text-gray-400">{f.products}</p>}
          </button>
          {canManage(f) && (
            <div className="mt-1 flex gap-3">
              <button onClick={() => onEdit(f)} className="text-xs text-blue-600 hover:underline">
                Edit
              </button>
              <button onClick={() => onDelete(f)} className="text-xs text-red-600 hover:underline">
                Delete
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
