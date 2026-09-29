import { createContext, useContext, useState, useEffect } from 'react'
import supabase from '../services/supabaseClient'
import { useAuth } from './AuthContext'

const ProjectContext = createContext(null)

const ACTIVE_PROJECT_KEY = 'kp_active_project_id'

export const ProjectProvider = ({ children }) => {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProjects = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('project')
        .select('*')
        .order('status_project', { ascending: true }) // aktif duluan
        .order('tanggal_mulai', { ascending: false })
      if (error) throw error
      const list = data || []
      setProjects(list)

      // Coba restore project yang terakhir dipilih
      const savedId = localStorage.getItem(ACTIVE_PROJECT_KEY)
      const saved = savedId ? list.find(p => p.id === parseInt(savedId)) : null

      if (saved) {
        setActiveProject(saved)
      } else {
        // Default ke project aktif pertama
        const aktif = list.find(p => p.status_project === 'aktif') || list[0]
        if (aktif) {
          setActiveProject(aktif)
          localStorage.setItem(ACTIVE_PROJECT_KEY, aktif.id)
        }
      }
    } catch (e) {
      console.error('loadProjects error:', e.message)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  const handleSetActiveProject = (project) => {
    setActiveProject(project)
    if (project?.id) localStorage.setItem(ACTIVE_PROJECT_KEY, project.id)
  }

  // Muat proyek SETELAH login (dan ulangi bila akun berganti). Sebelum RLS diaktifkan tabel 'project'
  // terbuka untuk publik sehingga memuat saat aplikasi dibuka sudah cukup; sekarang permintaan tanpa
  // login ditolak, jadi daftar harus dimuat setelah sesi ada dan dikosongkan saat logout.
  const userKey = user?.email || null
  useEffect(() => {
    if (userKey) loadProjects()
    else { setProjects([]); setActiveProject(null); setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey])

  return (
    <ProjectContext.Provider value={{
      projects, activeProject,
      setActiveProject: handleSetActiveProject,
      loading, loadProjects
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}

export default ProjectContext
