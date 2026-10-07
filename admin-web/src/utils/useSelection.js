import { useState, useCallback } from 'react'

// Hook kecil untuk pola "ceklist pilih banyak baris + ceklist semua" di
// halaman-halaman daftar (Karyawan, Golongan, Project, dll).
export function useSelection() {
  const [selected, setSelected] = useState(() => new Set())

  const toggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids) => {
    setSelected(prev => {
      const semuaTerpilih = ids.length > 0 && ids.every(id => prev.has(id))
      return semuaTerpilih ? new Set() : new Set(ids)
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, toggleAll, clear }
}
