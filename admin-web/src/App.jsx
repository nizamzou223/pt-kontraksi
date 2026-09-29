import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoginPage from './components/auth/LoginPage'
import ResetPasswordPage from './components/auth/ResetPasswordPage'
import { PageActiveContext } from './utils/pageActivity'
import { Sidebar, Navbar } from './components/common'
import './styles/globals.css'

// ─── Lazy-load tiap halaman — hanya kode halaman aktif yang di-download saat refresh ───
// lazyRetry: kalau deploy baru mengganti nama file chunk sementara tab lama masih
// terbuka, import() lama akan gagal ("Failed to fetch dynamically imported module").
// Daripada layar putih/error, reload sekali otomatis supaya user dapat index.html + chunk terbaru.
function lazyRetry(importer) {
  return lazy(() =>
    importer().catch((err) => {
      const key = 'chunk-retry-' + importer.toString()
      const alreadyRetried = sessionStorage.getItem(key)
      if (!alreadyRetried) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        return new Promise(() => {}) // tahan render sampai reload jalan
      }
      sessionStorage.removeItem(key)
      throw err
    })
  )
}

const DashboardCorporate  = lazyRetry(() => import('./components/dashboard/DashboardCorporate'))
const DepartemenList      = lazyRetry(() => import('./components/masterdata/DepartemenJabatan').then(m => ({ default: m.DepartemenList })))
const JabatanList         = lazyRetry(() => import('./components/masterdata/DepartemenJabatan').then(m => ({ default: m.JabatanList })))
const KaryawanList        = lazyRetry(() => import('./components/masterdata/KaryawanList'))
const ProjectList         = lazyRetry(() => import('./components/masterdata/ProjectList').then(m => ({ default: m.ProjectList })))
const QRCodeGenerator     = lazyRetry(() => import('./components/masterdata/ProjectList').then(m => ({ default: m.QRCodeGenerator })))
const PresensiList        = lazyRetry(() => import('./components/penggajian/PresensiList'))
const LemburList          = lazyRetry(() => import('./components/penggajian/LemburList'))
const KasbonList          = lazyRetry(() => import('./components/penggajian/KasbonList'))
const GajiMingguan        = lazyRetry(() => import('./components/penggajian/GajiMingguan'))
const GajiBulanan         = lazyRetry(() => import('./components/penggajian/GajiBulanan'))
const PembayaranOtomatis  = lazyRetry(() => import('./components/penggajian/PembayaranOtomatis'))
const BarangList          = lazyRetry(() => import('./components/inventaris/BarangList'))
const StokMasuk           = lazyRetry(() => import('./components/inventaris/StokMasuk'))
const StokKeluar          = lazyRetry(() => import('./components/inventaris/StokKeluar'))
const PermintaanBarang    = lazyRetry(() => import('./components/inventaris/PermintaanBarang'))
const ReturBarang         = lazyRetry(() => import('./components/inventaris/ReturBarang'))
const MonitoringStok      = lazyRetry(() => import('./components/inventaris/MonitoringStok'))
const PrediksiStok        = lazyRetry(() => import('./components/inventaris/PrediksiStok'))
const LaporanProject      = lazyRetry(() => import('./components/laporan/LaporanProject'))
const LaporanKaryawan     = lazyRetry(() => import('./components/laporan/LaporanKaryawan'))
const LaporanRingkasan    = lazyRetry(() => import('./components/laporan/LaporanRingkasan'))
const LaporanInventaris   = lazyRetry(() => import('./components/laporan/LaporanInventaris'))
const LaporanBarang       = lazyRetry(() => import('./components/laporan/LaporanBarang'))
const LaporanUang         = lazyRetry(() => import('./components/laporan/LaporanUang'))
const UserList             = lazyRetry(() => import('./components/pengaturan/UserAudit').then(m => ({ default: m.UserList })))
const AuditLog             = lazyRetry(() => import('./components/pengaturan/UserAudit').then(m => ({ default: m.AuditLog })))
const MandorManagement    = lazyRetry(() => import('./components/pengaturan/MandorManagement'))
const ProfilePage         = lazyRetry(() => import('./components/profile/ProfilePage'))
// Sistem Cerdas (modul tambahan: peramalan material & deteksi anomali)
const RingkasanCerdas     = lazyRetry(() => import('./components/ai/RingkasanCerdas'))
const PeramalanMaterial   = lazyRetry(() => import('./components/ai/PeramalanMaterial'))
const DeteksiAnomali      = lazyRetry(() => import('./components/ai/DeteksiAnomali'))

// ─── Daftar semua route ──────────────────────────────────────────────────────
const ROUTES = [
  { path: '/',                              component: DashboardCorporate },
  { path: '/master/departemen',             component: DepartemenList },
  { path: '/master/jabatan',               component: JabatanList },
  { path: '/master/karyawan',              component: KaryawanList },
  { path: '/master/project',               component: ProjectList },
  { path: '/master/qrcode',               component: QRCodeGenerator },
  { path: '/penggajian/presensi',          component: PresensiList },
  { path: '/penggajian/lembur',            component: LemburList },
  { path: '/penggajian/kasbon',            component: KasbonList },
  { path: '/penggajian/gaji-mingguan',     component: GajiMingguan },
  { path: '/penggajian/gaji-bulanan',      component: GajiBulanan },
  { path: '/penggajian/pembayaran',        component: PembayaranOtomatis },
  { path: '/inventaris/barang',            component: BarangList },
  { path: '/inventaris/stok-masuk',        component: StokMasuk },
  { path: '/inventaris/stok-keluar',       component: StokKeluar },
  { path: '/inventaris/permintaan',        component: PermintaanBarang },
  { path: '/inventaris/retur',             component: ReturBarang },
  { path: '/inventaris/monitoring',        component: MonitoringStok },
  { path: '/inventaris/prediksi',          component: PrediksiStok },
  { path: '/laporan/ringkasan',            component: LaporanRingkasan },
  { path: '/laporan/project',              component: LaporanProject },
  { path: '/laporan/karyawan',             component: LaporanKaryawan },
  { path: '/laporan/inventaris',           component: LaporanInventaris },
  { path: '/laporan/inventory-barang',     component: LaporanBarang },
  { path: '/laporan/inventory-uang',       component: LaporanUang },
  { path: '/pengaturan/users',             component: UserList },
  { path: '/pengaturan/mandor-accounts',   component: MandorManagement },
  { path: '/pengaturan/audit-log',         component: AuditLog },
  { path: '/profile',                      component: ProfilePage },
  { path: '/ai',                           component: RingkasanCerdas },
  { path: '/ai/peramalan',                 component: PeramalanMaterial },
  { path: '/ai/anomali',                   component: DeteksiAnomali },
]

// ─── KeepAlive: mount halaman, hide/show via CSS ─────────────────────────────
// Halaman yang baru dibuka tetap ter-mount → tidak ada re-fetch saat pindah menu.
// Dibatasi MAX_KEPT_PAGES (paling lama tak dipakai dibuang) supaya ratusan timer, langganan
// realtime, dan tabel besar tidak menumpuk di memori seiring lama sesi.
// Tiap halaman diberi tahu apakah sedang aktif (PageActiveContext) → polling/realtime
// halaman tersembunyi otomatis berhenti (lihat utils/pageActivity).
const MAX_KEPT_PAGES = 6

function KeepAlivePages() {
  const location = useLocation()
  const keptRef = useRef([]) // urutan pemakaian: paling baru di ujung

  // Tentukan path aktif — fallback ke '/' jika tidak ada yang cocok
  const activePath = ROUTES.some(r => r.path === location.pathname)
    ? location.pathname
    : null

  if (activePath) {
    const kept = keptRef.current
    const i = kept.indexOf(activePath)
    if (i >= 0) kept.splice(i, 1)
    kept.push(activePath)
    while (kept.length > MAX_KEPT_PAGES) kept.shift()
  }

  return (
    <>
      {ROUTES.map(({ path, component: Component }) => {
        if (!keptRef.current.includes(path)) return null
        const isActive = path === activePath
        return (
          <div
            key={path}
            style={{ display: isActive ? 'contents' : 'none' }}
            aria-hidden={!isActive}
          >
            {/* Suspense per-halaman — memuat 1 halaman baru tidak menyembunyikan halaman lain yang sudah aktif */}
            <PageActiveContext.Provider value={isActive}>
              <Suspense fallback={<PageLoader />}>
                <Component />
              </Suspense>
            </PageActiveContext.Provider>
          </div>
        )
      })}
      {/* Redirect jika path tidak dikenal */}
      {!activePath && <Navigate to="/" replace />}
    </>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Sidebar persistence ─────────────────────────────────────────────────────
function usePersistedSidebar() {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('sidebar_open')
    if (saved !== null) return saved === 'true'
    return window.innerWidth >= 1024
  })
  const set = (val) => {
    const resolved = typeof val === 'function' ? val(open) : val
    setOpen(resolved)
    localStorage.setItem('sidebar_open', String(resolved))
  }
  return [open, set]
}

// ─── Layout ──────────────────────────────────────────────────────────────────
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = usePersistedSidebar()
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  )

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024
      setIsDesktop(desktop)
      const saved = localStorage.getItem('sidebar_open')
      if (desktop && saved === null) setSidebarOpen(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Refresh data saat tab browser kembali aktif (bukan saat navigasi biasa)
  useEffect(() => {
    let lastRefresh = 0
    const COOLDOWN_MS = 15_000

    const refresh = () => {
      const now = Date.now()
      if (now - lastRefresh < COOLDOWN_MS) return
      lastRefresh = now
      window.dispatchEvent(new Event('dataRefreshed'))
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onToggle={() => setSidebarOpen(v => !v)} />
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ marginLeft: isDesktop && sidebarOpen ? '256px' : '0' }}
      >
        <Navbar onMenuToggle={() => setSidebarOpen(v => !v)} sidebarOpen={sidebarOpen} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <KeepAlivePages />
        </main>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
      <LanguageProvider>
      <AuthProvider>
        <ProjectProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: { fontSize: '13px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
              success: { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }, iconTheme: { primary: '#16a34a', secondary: '#f0fdf4' } },
              error: { style: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }, iconTheme: { primary: '#dc2626', secondary: '#fef2f2' } },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Publik: tujuan tautan "lupa password" dari email (token ada di fragmen URL) */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </ProjectProvider>
      </AuthProvider>
      </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}