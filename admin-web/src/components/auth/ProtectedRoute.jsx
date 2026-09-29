import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  // Selama loading, tampilkan spinner — jangan redirect dulu
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500">Memuat sistem...</p>
    </div>
  )

  // Setelah loading selesai, cek apakah user ada
  if (!user) return <Navigate to="/login" replace />

  return children
}
