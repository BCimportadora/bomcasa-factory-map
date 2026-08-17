export default function SearchFilter({ query, onQueryChange, province, onProvinceChange, provinces }) {
  return (
    <div className="space-y-2 border-b p-4">
      <input
        type="text"
        placeholder="Search by name, city, product..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <select
        value={province}
        onChange={(e) => onProvinceChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      >
        <option value="">All provinces</option>
        {provinces.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  )
}
