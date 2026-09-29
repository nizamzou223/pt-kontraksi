import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, Tag } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useNotification } from '../../context/NotificationContext'
import JabatanForm from './JabatanForm'

interface Golongan {
  id: number
  nama_jabatan: string
  karyawan_count: number
  is_deletable: boolean
  deskripsi?: string
  created_at: string
}

const JabatanList: React.FC = () => {
  const [list, setList]             = useState<Golongan[]>([])
  const [filtered, setFiltered]     = useState<Golongan[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editData, setEditData]     = useState<Golongan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Golongan | null>(null)
  const [deleting, setDeleting]     = useState(false)
  const { success, error: showError } = useNotification()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jabatan')
      .select('id, nama_jabatan, karyawan_count, is_deletable, deskripsi, created_at')
      .order('nama_jabatan')
    if (error) showError('Gagal memuat data golongan')
    else { setList(data || []); setFiltered(data || []) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(list.filter(g => g.nama_jabatan.toLowerCase().includes(q)))
  }, [search, list])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { count } = await supabase
      .from('karyawan')
      .select('id', { count: 'exact', head: true })
      .eq('jabatan_id', deleteTarget.id)
    if ((count ?? 0) > 0) {
      showError(`Golongan masih digunakan oleh ${count} karyawan, tidak bisa dihapus`)
      setDeleteTarget(null)
      setDeleting(false)
      return
    }
    const { error } = await supabase.from('jabatan').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) showError('Gagal menghapus golongan: ' + error.message)
    else { success('Golongan dihapus'); setDeleteTarget(null); fetchData() }
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Golongan Kerja</h2>
          <p className="page-subtitle">Kelola pengelompokan / golongan karyawan — gaji diatur per karyawan</p>
        </div>
        <button
          onClick={() => { setEditData(null); setShowForm(true) }}
          className="btn-primary btn-sm flex items-center gap-1.5"
        >
          <Plus size={16} /> Tambah Golongan
        </button>
      </div>

      {/* Info box */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 text-sm text-indigo-700 flex items-start gap-3">
        <Tag size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Golongan = Label Peran Karyawan</p>
          <p className="text-xs text-indigo-600 mt-0.5">Gaji harian, tarif lembur, dan tunjangan diatur langsung di halaman <strong>Karyawan</strong> — bukan di sini. Golongan hanya digunakan untuk pengelompokan laporan.</p>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari golongan..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Memuat data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide w-10">No</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Nama Golongan</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Deskripsi</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Jumlah Karyawan</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      {search ? 'Tidak ada golongan yang ditemukan' : 'Belum ada data golongan'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((g, idx) => (
                    <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <Tag size={13} className="text-indigo-600" />
                          </div>
                          <span className="font-semibold text-gray-800">{g.nama_jabatan}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs max-w-xs">{g.deskripsi || '—'}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${g.karyawan_count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {g.karyawan_count} karyawan
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setEditData(g); setShowForm(true) }}
                            className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-500 transition-colors"
                            title="Edit Golongan"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(g)}
                            disabled={!g.is_deletable}
                            className="p-2 rounded-xl hover:bg-red-50 text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Hapus Golongan"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{filtered.length} golongan</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <JabatanForm
          editData={editData as any}
          onClose={() => { setShowForm(false); setEditData(null) }}
          onSaved={() => { setShowForm(false); setEditData(null); fetchData() }}
        />
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Hapus Golongan</h3>
            <p className="text-sm text-gray-600 mb-6">
              Hapus golongan <strong>"{deleteTarget.nama_jabatan}"</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50">Batal</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default JabatanList
