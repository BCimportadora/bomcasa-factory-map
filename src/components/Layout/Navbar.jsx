import { useAuth } from '../../context/AuthContext'
import { LogOut } from 'lucide-react'
import logo from '../../assets/logo.png'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm">
      <div className="flex items-center gap-2 font-semibold text-gray-800">
        <img src={logo} alt="Bomcasa logo" className="h-8 w-auto" />
        <span className="hidden sm:inline">Bomcasa Factory Map</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-gray-600 sm:inline">{user?.email}</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {profile?.role ?? '...'}
        </span>
        <button onClick={signOut} className="flex items-center gap-1 text-gray-500 hover:text-red-600">
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
