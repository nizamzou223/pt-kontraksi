import { useEffect, useRef } from 'react'
import { today } from './autoFill'

/**
 * Memanggil callback saat tanggal (hari) berubah — berguna untuk auto-refresh
 * presensi saat tengah malam atau ketika tab dibuka kembali di hari berbeda.
 */
export function useOnDateChange(callback) {
  const lastDate = useRef(today())

  useEffect(() => {
    const check = () => {
      const now = today()
      if (now !== lastDate.current) {
        lastDate.current = now
        callback(now)
      }
    }

    // Cek setiap 60 detik
    const interval = setInterval(check, 60_000)

    // Cek juga saat tab kembali aktif
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [callback])
}
