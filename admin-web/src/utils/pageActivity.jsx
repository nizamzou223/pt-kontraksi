import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { scheduleRefresh } from './refreshScheduler'

// ─────────────────────────────────────────────────────────────────────────────
// Kenapa file ini ada?
//   Semua halaman yang pernah dibuka tetap ter-mount (KeepAlive) dan masing-masing
//   punya timer auto-refresh. Browser menahan timer saat tab tidak aktif, lalu saat tab
//   dibuka lagi SEMUA timer menembak sekaligus → puluhan query serentak → web "macet".
//   Sekarang polling hanya jalan bila TAB terlihat DAN HALAMAN sedang aktif, dan refresh
//   setelah kembali aktif dijalankan satu per satu (lihat refreshScheduler).
// ─────────────────────────────────────────────────────────────────────────────

/** true bila halaman ini sedang ditampilkan (disediakan oleh KeepAlivePages). */
export const PageActiveContext = createContext(true)
export const usePageActive = () => useContext(PageActiveContext)

/** true bila tab browser sedang terlihat. */
export function useTabVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/**
 * Menjalankan `fn` tiap `intervalMs` HANYA saat tab terlihat & halaman aktif.
 * Saat kembali aktif dan datanya sudah basi (atau ada perubahan yang tertunda), `fn` dijalankan
 * sekali dengan jeda acak kecil lewat antrean — bukan serentak dengan halaman lain.
 *
 * Mengembalikan `request()`: minta refresh sekarang bila aktif, atau tandai "perlu refresh"
 * bila sedang tersembunyi (dipakai handler realtime agar halaman tersembunyi tidak bekerja).
 * `intervalMs` kosong/0 → tanpa polling berkala (hanya lewat request()).
 */
export function usePolling(fn, intervalMs, { enabled = true } = {}) {
  const active = usePageActive()
  const visible = useTabVisible()
  const live = enabled && active && visible

  const fnRef = useRef(fn)
  fnRef.current = fn
  const liveRef = useRef(live)
  liveRef.current = live
  const lastRun = useRef(Date.now())
  const dirty = useRef(false)
  const key = useRef(`poll-${Math.random().toString(36).slice(2)}`)

  const run = useCallback(() => {
    lastRun.current = Date.now()
    dirty.current = false
    scheduleRefresh(() => fnRef.current(), { key: key.current })
  }, [])

  useEffect(() => {
    if (!live) return undefined
    let jitter
    const stale = intervalMs ? Date.now() - lastRun.current >= intervalMs : false
    if (dirty.current || stale) jitter = setTimeout(run, 250 + Math.random() * 900)
    const id = intervalMs ? setInterval(run, intervalMs) : null
    return () => { clearTimeout(jitter); if (id) clearInterval(id) }
  }, [live, intervalMs, run])

  return useCallback(() => {
    if (liveRef.current) run()
    else dirty.current = true
  }, [run])
}
