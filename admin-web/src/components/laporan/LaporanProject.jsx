import supabase from '../../services/supabaseClient'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  BarChart2, Users, Calendar, DollarSign, Clock,
  AlertTriangle, Package, ArrowDownCircle, ArrowUpCircle,
  ShoppingCart, CreditCard, TrendingUp, Download,
  MapPin, CheckCircle2, Building2, UserCheck, Wallet,
  Activity, ChevronRight, Briefcase
} from 'lucide-react'
import { Card, Button, Select, PageHeader, AlertInPage, Input, DropdownSelect } from '../common'
import { projectService } from '../../services/projectService'
import { payrollService } from '../../services/payrollService'
import { formatRupiah, formatTanggal } from '../../utils/formatters'
import { today } from '../../utils/autoFill'

const thisMonth = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`
}
function diffDays(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000) }
function progressPercent(mulai, selesai) {
  if (!mulai || !selesai) return null
  const now = new Date(); const start = new Date(mulai); const end = new Date(selesai)
  if (now < start) return 0; if (now > end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}
function exportCSV(rows, filename) {
  if (!rows.length) return
  const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

function MiniStat({ label, value, sub, color = 'blue', icon: Icon }) {
  const clr = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700', green: 'bg-green-50 border-green-100 text-green-700',
    red: 'bg-red-50 border-red-100 text-red-700', amber: 'bg-amber-50 border-amber-100 text-amber-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700', slate: 'bg-slate-50 border-slate-100 text-slate-700',
    teal: 'bg-teal-50 border-teal-100 text-teal-700', indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
  }
  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${clr[color]}`}>
      {Icon && <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm"><Icon size={17} className="opacity-80" /></div>}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-xl font-extrabold mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
function SectionTitle({ icon: Icon, title, color = 'text-gray-700', action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className={`flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider ${color}`}>{Icon && <Icon size={15} />} {title}</div>
      {action}
    </div>
  )
}
const STATUS_CLS = { disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700', pending: 'bg-amber-100 text-amber-700', aktif: 'bg-blue-100 text-blue-700', selesai: 'bg-gray-100 text-gray-600' }

// ─── Komponen: Tabel Karyawan Dikelompokkan per Golongan ───────────────────────
function KaryawanPerJabatan({ rows, title = 'Karyawan per Golongan', exportName }) {
  // Kelompokkan berdasarkan jabatan
  const byJabatan = {}
  rows.forEach(r => {
    const jab = r.jabatan || 'Tanpa Golongan'
    if (!byJabatan[jab]) byJabatan[jab] = []
    byJabatan[jab].push(r)
  })

  return (
    <Card>
      {Object.entries(byJabatan).map(([jabatan, anggota]) => (
        <div key={jabatan} className="mb-4 last:mb-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl mb-2">
            <Briefcase size={13} className="text-indigo-500" />
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{jabatan}</span>
            <span className="ml-auto text-xs text-indigo-500">{anggota.length} orang</span>
          </div>
          <div className="space-y-1">
            {anggota.map((k, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2 bg-gray-50 hover:bg-blue-50 rounded-xl transition-colors">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                  {k.nama?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{k.nama}</p>
                  {k.id_karyawan && <p className="text-xs text-gray-400">{k.id_karyawan}</p>}
                </div>
                {k.hari !== undefined && <span className="text-xs font-bold text-blue-700 flex-shrink-0">{k.hari} hari</span>}
                {k.gaji_bersih !== undefined && <span className="text-sm font-bold text-green-700 flex-shrink-0">{formatRupiah(k.gaji_bersih)}</span>}
                {k.status && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${k.status === 'dibayar' ? 'bg-green-100 text-green-700' : k.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {k.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}

export default function LaporanProject() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [periodeStart, setPeriodeStart] = useState(thisMonth())
  const [periodeEnd, setPeriodeEnd] = useState(today())

  const [projectDetail, setProjectDetail] = useState(null)
  const [presensiData, setPresensiData] = useState([])
  const [gajiMingguanData, setGajiMingguanData] = useState([])
  const [gajiPerKaryawan, setGajiPerKaryawan] = useState([])  // dari rekap gaji mingguan per project
  const [lemburData, setLemburData] = useState([])
  const [kasbonData, setKasbonData] = useState([])
  const [stokMasuk, setStokMasuk] = useState([])
  const [stokKeluar, setStokKeluar] = useState([])
  const [permintaanData, setPermintaanData] = useState([])
  const [karyawanProject, setKaryawanProject] = useState([])

  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    projectService.getProjects().then(setProjects).catch(e => toast.error(e.message))
  }, [])

  const loadLaporan = async () => {
    if (!selectedProject) return toast.error('Pilih project terlebih dahulu')
    setLoading(true); setLoaded(false)
    try {
      const pid = parseInt(selectedProject)
      const dateEnd = periodeEnd + 'T23:59:59'

      const [proj, prs, lb, kb, sm, sk, pm, anggota] = await Promise.all([
        supabase.from('project').select('*, karyawan!project_manager_id(nama_karyawan, jabatan(nama_jabatan))').eq('id', pid).single().then(r => r.data),
        supabase.from('presensi').select('karyawan_id, tanggal, status_kehadiran, durasi_jam, uang_makan, uang_transport, upah_luar_kota, karyawan(nama_karyawan, id_karyawan, jabatan(nama_jabatan))').eq('project_id', pid).gte('tanggal', periodeStart).lte('tanggal', periodeEnd).order('tanggal', { ascending: false }).then(r => r.data || []),
        supabase.from('lembur').select('id, tanggal, durasi_jam, total_lembur, status_persetujuan, karyawan(nama_karyawan, id_karyawan, jabatan(nama_jabatan))').eq('project_id', pid).gte('tanggal', periodeStart).lte('tanggal', periodeEnd).order('tanggal', { ascending: false }).then(r => r.data || []),
        supabase.from('kasbon').select('id, tanggal_kasbon, jumlah_kasbon, sisa_kasbon, status_lunas, catatan, karyawan(nama_karyawan, id_karyawan, jabatan(nama_jabatan))').eq('project_id', pid).gte('tanggal_kasbon', periodeStart).lte('tanggal_kasbon', periodeEnd).order('tanggal_kasbon', { ascending: false }).then(r => r.data || []),
        supabase.from('stok_masuk').select('id, jumlah, catatan, created_at, barang(nama_barang, kode_barang, satuan_barang(singkatan))').eq('project_id', pid).gte('created_at', periodeStart).lte('created_at', dateEnd).order('created_at', { ascending: false }).then(r => r.data || []),
        supabase.from('stok_keluar').select('id, jumlah, tujuan, created_at, barang(nama_barang, kode_barang, satuan_barang(singkatan))').eq('project_id', pid).gte('created_at', periodeStart).lte('created_at', dateEnd).order('created_at', { ascending: false }).then(r => r.data || []),
        supabase.from('permintaan_barang').select('id, jumlah_diminta, status_permintaan, catatan, created_at, barang(nama_barang, kode_barang, satuan_barang(singkatan)), karyawan!peminta_id(nama_karyawan, id_karyawan)').eq('project_id', pid).gte('created_at', periodeStart).lte('created_at', dateEnd).order('created_at', { ascending: false }).then(r => r.data || []),
        supabase.from('project_karyawan').select('tanggal_mulai, status_assignment, catatan, karyawan(nama_karyawan, id_karyawan, jabatan(nama_jabatan))').eq('project_id', pid).eq('status_assignment', 'aktif').then(r => r.data || []),
      ])

      // Rekap gaji per project: ambil dari rekap_gaji_mingguan karyawan yg ada di project ini
      // Filter berdasarkan project_details JSONB
      const karyawanIds = anggota.map(a => a.karyawan?.id_karyawan ? a.karyawan : null).filter(Boolean)
      // Ambil ID dari project_karyawan
      const { data: pkData } = await supabase.from('project_karyawan')
        .select('karyawan_id').eq('project_id', pid)
      const pKids = (pkData || []).map(x => x.karyawan_id)

      // Rekap gaji mingguan karyawan di project ini, di periode ini
      const { data: gajiRows } = await supabase.from('rekap_gaji_mingguan')
        .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan))')
        .in('karyawan_id', pKids.length > 0 ? pKids : [0])
        .gte('periode_mulai', periodeStart).lte('periode_selesai', periodeEnd)

      setProjectDetail(proj)
      setPresensiData(prs)
      setGajiMingguanData(gajiRows || [])
      setLemburData(lb)
      setKasbonData(kb)
      setStokMasuk(sm)
      setStokKeluar(sk)
      setPermintaanData(pm)
      setKaryawanProject(anggota)
      setLoaded(true)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const project = projectDetail || projects.find(p => p.id === parseInt(selectedProject))
  const pct = project ? progressPercent(project.tanggal_mulai, project.tanggal_selesai) : null
  const sisaHari = project?.tanggal_selesai ? diffDays(today(), project.tanggal_selesai) : null

  // Kehadiran per karyawan
  const hadirRows = presensiData.filter(p => p.status_kehadiran === 'hadir')
  const uniqueHadir = new Set(hadirRows.map(p => p.karyawan_id)).size
  const totalHariKerja = hadirRows.length

  // Kehadiran per karyawan + dikelompokkan per jabatan
  const hadirPerKaryawan = {}
  hadirRows.forEach(p => {
    const id = p.karyawan_id
    if (!hadirPerKaryawan[id]) hadirPerKaryawan[id] = { nama: p.karyawan?.nama_karyawan, id_karyawan: p.karyawan?.id_karyawan, jabatan: p.karyawan?.jabatan?.nama_jabatan, hari: 0 }
    hadirPerKaryawan[id].hari++
  })
  const kehadiranList = Object.values(hadirPerKaryawan).sort((a, b) => b.hari - a.hari)

  // Gaji per karyawan dari rekap mingguan (dikelompokkan per jabatan)
  const gajiPerKaryawanList = (() => {
    const byK = {}
    gajiMingguanData.forEach(g => {
      const kid = g.karyawan_id
      if (!byK[kid]) byK[kid] = {
        nama: g.karyawan?.nama_karyawan, id_karyawan: g.karyawan?.id_karyawan,
        jabatan: g.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan',
        gaji_bersih: 0, gaji_kotor: 0, hari: 0, lembur: 0, kasbon: 0, status: g.status,
      }
      byK[kid].gaji_bersih += parseFloat(g.gaji_bersih || 0)
      byK[kid].gaji_kotor += parseFloat(g.gaji_kotor || 0)
      byK[kid].hari += parseInt(g.total_hari_hadir || 0)
      byK[kid].lembur += parseFloat(g.total_uang_lembur || 0)
      byK[kid].kasbon += parseFloat(g.total_potongan_kasbon || 0)
      // Status: jika ada draft, tampilkan draft
      if (g.status === 'draft') byK[kid].status = 'draft'
    })
    return Object.values(byK).sort((a, b) => (a.jabatan || '').localeCompare(b.jabatan || ''))
  })()

  const gajiBayar = gajiMingguanData.filter(g => g.status === 'dibayar')
  const totalGajiBersih = gajiBayar.reduce((s, g) => s + parseFloat(g.gaji_bersih || 0), 0)
  const totalLemburNilai = lemburData.reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0)
  const totalLemburJam = lemburData.reduce((s, l) => s + parseFloat(l.durasi_jam || 0), 0)
  const lemburDisetujui = lemburData.filter(l => l.status_persetujuan === 'disetujui')
  const totalLemburDisetujui = lemburDisetujui.reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0)
  const totalKasbonNilai = kasbonData.reduce((s, k) => s + parseFloat(k.jumlah_kasbon || 0), 0)
  const totalKasbonSisa = kasbonData.filter(k => !k.status_lunas).reduce((s, k) => s + parseFloat(k.sisa_kasbon || 0), 0)
  const kasbonOutstanding = kasbonData.filter(k => !k.status_lunas).length
  const totalMasukQty = stokMasuk.reduce((s, r) => s + parseInt(r.jumlah || 0), 0)
  const totalKeluarQty = stokKeluar.reduce((s, r) => s + parseInt(r.jumlah || 0), 0)
  const permintaanPending = permintaanData.filter(p => p.status_permintaan === 'pending').length
  const permintaanDisetujui = permintaanData.filter(p => p.status_permintaan === 'disetujui').length
  const totalPengeluaran = totalGajiBersih + totalLemburDisetujui + totalKasbonNilai

  return (
    <div className="space-y-5">
      <PageHeader title="Laporan per Project" subtitle="Perkembangan project, kehadiran, penggajian, lembur, kasbon, dan inventaris" />

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Project</label>
            <DropdownSelect
              value={selectedProject}
              onChange={v => { setSelectedProject(v); setLoaded(false) }}
              options={[
                { value: '', label: 'Pilih project...' },
                ...projects.map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Dari</label>
            <Input type="date" value={periodeStart} onChange={e => setPeriodeStart(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Sampai</label>
            <Input type="date" value={periodeEnd} onChange={e => setPeriodeEnd(e.target.value)} className="w-auto" />
          </div>
          <Button onClick={loadLaporan} loading={loading} icon={BarChart2}>Tampilkan</Button>
        </div>
      </Card>

      {loaded && project && (
        <>
          {/* PROJECT HEADER */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-blue-200 text-xs font-bold uppercase tracking-widest">{project.kode_project}</span>
                <h2 className="text-2xl font-extrabold mt-1">{project.nama_project}</h2>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-blue-200">
                  {project.lokasi && <span className="flex items-center gap-1"><MapPin size={12} /> {project.lokasi}</span>}
                  <span className="flex items-center gap-1"><Calendar size={12} /> {formatTanggal(project.tanggal_mulai)} — {project.tanggal_selesai ? formatTanggal(project.tanggal_selesai) : 'Belum ditentukan'}</span>
                  {project.karyawan?.nama_karyawan && <span className="flex items-center gap-1"><UserCheck size={12} /> PM: {project.karyawan.nama_karyawan}</span>}
                </div>
                {pct !== null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-blue-200 mb-1">
                      <span>Progress waktu</span>
                      <span>{pct}% {sisaHari > 0 ? `· ${sisaHari} hari lagi` : sisaHari === 0 ? '· Hari ini deadline' : '· Sudah lewat deadline'}</span>
                    </div>
                    <div className="h-2 bg-blue-900/60 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right shrink-0">
                {project.budget_total > 0 && <div><p className="text-blue-200 text-xs uppercase tracking-wide">Budget Total</p><p className="text-lg font-extrabold">{formatRupiah(project.budget_total)}</p></div>}
                <div><p className="text-blue-200 text-xs uppercase tracking-wide">Pengeluaran Periode</p><p className="text-lg font-extrabold">{formatRupiah(totalPengeluaran)}</p></div>
                <div><p className="text-blue-200 text-xs uppercase tracking-wide">Karyawan Aktif</p><p className="text-lg font-extrabold">{karyawanProject.length} orang</p></div>
                <div><p className="text-blue-200 text-xs uppercase tracking-wide">Status</p><p className="text-lg font-extrabold capitalize">{project.status_project}</p></div>
              </div>
            </div>
            {project.budget_total > 0 && totalPengeluaran > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-500/30">
                <div className="flex items-center justify-between text-xs text-blue-200 mb-1">
                  <span>Penggunaan budget</span>
                  <span>{Math.round((totalPengeluaran / project.budget_total) * 100)}% dari total budget</span>
                </div>
                <div className="h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${(totalPengeluaran / project.budget_total) > 0.9 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, (totalPengeluaran / project.budget_total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* RINGKASAN */}
          <div>
            <SectionTitle icon={Wallet} title="Ringkasan Pengeluaran Periode" color="text-blue-700" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Total Gaji Dibayar" value={formatRupiah(totalGajiBersih)} color="blue" icon={DollarSign} sub={`${gajiBayar.length} rekap`} />
              <MiniStat label="Total Lembur" value={formatRupiah(totalLemburDisetujui)} color="green" icon={TrendingUp} sub={`${totalLemburJam.toFixed(1)} jam`} />
              <MiniStat label="Total Kasbon" value={formatRupiah(totalKasbonNilai)} color="amber" icon={CreditCard} sub={`${kasbonOutstanding} outstanding`} />
              <MiniStat label="Total Pengeluaran" value={formatRupiah(totalPengeluaran)} color="indigo" icon={Activity} />
            </div>
          </div>

          {/* KEHADIRAN PER GOLONGAN */}
          <div>
            <SectionTitle icon={Users} title="Kehadiran Karyawan — per Golongan" color="text-blue-700"
              action={kehadiranList.length > 0 && (
                <Button variant="outline" size="sm" icon={Download} onClick={() =>
                  exportCSV(kehadiranList.map(k => ({ 'ID Karyawan': k.id_karyawan || '-', Karyawan: k.nama || '-', Golongan: k.jabatan || '-', 'Hari Hadir': k.hari })), `kehadiran-${project.kode_project}.csv`)
                }>Export CSV</Button>
              )}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MiniStat label="Karyawan Hadir" value={`${uniqueHadir} orang`} color="blue" icon={Users} />
              <MiniStat label="Total Hari Kehadiran" value={`${totalHariKerja} hari`} color="teal" icon={Calendar} />
              <MiniStat label="Anggota Aktif Project" value={`${karyawanProject.length} orang`} color="slate" icon={UserCheck} />
              <MiniStat label="Rata-rata Kehadiran" value={uniqueHadir > 0 ? `${(totalHariKerja / uniqueHadir).toFixed(1)} hr/org` : '-'} color="purple" icon={BarChart2} />
            </div>
            {kehadiranList.length > 0 && (
              <KaryawanPerJabatan rows={kehadiranList} exportName={`kehadiran-${project.kode_project}`} />
            )}
          </div>

          {/* REKAP GAJI PER GOLONGAN */}
          {gajiPerKaryawanList.length > 0 && (
            <div>
              <SectionTitle icon={DollarSign} title="Rekap Gaji Karyawan — per Golongan" color="text-green-700"
                action={
                  <Button variant="outline" size="sm" icon={Download} onClick={() =>
                    exportCSV(gajiPerKaryawanList.map(g => ({
                      'ID Karyawan': g.id_karyawan || '-', Karyawan: g.nama || '-', Golongan: g.jabatan || '-',
                      'Hari Hadir': g.hari, 'Gaji Bersih': g.gaji_bersih, 'Gaji Kotor': g.gaji_kotor,
                      Lembur: g.lembur, 'Potongan Kasbon': g.kasbon, Status: g.status,
                    })), `gaji-${project.kode_project}.csv`)
                  }>Export CSV</Button>
                }
              />
              <KaryawanPerJabatan rows={gajiPerKaryawanList} />
            </div>
          )}

          {/* LEMBUR */}
          <div>
            <SectionTitle icon={Clock} title="Lembur" color="text-teal-700"
              action={lemburData.length > 0 && (
                <Button variant="outline" size="sm" icon={Download} onClick={() =>
                  exportCSV(lemburData.map(l => ({ 'ID': l.karyawan?.id_karyawan || '-', Karyawan: l.karyawan?.nama_karyawan || '-', Golongan: l.karyawan?.jabatan?.nama_jabatan || '-', Tanggal: formatTanggal(l.tanggal), 'Durasi (jam)': parseFloat(l.durasi_jam || 0).toFixed(1), 'Total Lembur': l.total_lembur, Status: l.status_persetujuan })), `lembur-${project.kode_project}.csv`)
                }>Export CSV</Button>
              )}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MiniStat label="Total Catatan" value={lemburData.length} color="slate" icon={Clock} />
              <MiniStat label="Total Jam" value={`${totalLemburJam.toFixed(1)} jam`} color="teal" icon={TrendingUp} />
              <MiniStat label="Nilai Lembur" value={formatRupiah(totalLemburNilai)} color="blue" icon={DollarSign} />
              <MiniStat label="Sudah Disetujui" value={formatRupiah(totalLemburDisetujui)} color="green" icon={CheckCircle2} sub={`${lemburDisetujui.length} entri`} />
            </div>
            {lemburData.length > 0 && (
              <Card>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {lemburData.map((l, i) => (
                    <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 rounded-xl hover:bg-teal-50 transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0"><Clock size={14} className="text-teal-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{l.karyawan?.nama_karyawan}</p>
                        <p className="text-xs text-gray-400">{l.karyawan?.jabatan?.nama_jabatan}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatTanggal(l.tanggal)}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{parseFloat(l.durasi_jam || 0).toFixed(1)} jam</span>
                      <span className="text-sm font-bold text-teal-700 flex-shrink-0">{formatRupiah(l.total_lembur)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_CLS[l.status_persetujuan] || 'bg-gray-100 text-gray-600'}`}>{l.status_persetujuan}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* KASBON */}
          <div>
            <SectionTitle icon={CreditCard} title="Kasbon" color="text-red-700"
              action={kasbonData.length > 0 && (
                <Button variant="outline" size="sm" icon={Download} onClick={() =>
                  exportCSV(kasbonData.map(k => ({ Karyawan: k.karyawan?.nama_karyawan || '-', Golongan: k.karyawan?.jabatan?.nama_jabatan || '-', Tanggal: formatTanggal(k.tanggal_kasbon), 'Jumlah': k.jumlah_kasbon, Sisa: k.sisa_kasbon, Status: k.status_lunas ? 'Lunas' : 'Outstanding' })), `kasbon-${project.kode_project}.csv`)
                }>Export CSV</Button>
              )}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MiniStat label="Total Kasbon" value={kasbonData.length} color="slate" icon={CreditCard} />
              <MiniStat label="Nilai Total" value={formatRupiah(totalKasbonNilai)} color="amber" icon={DollarSign} />
              <MiniStat label="Outstanding" value={kasbonOutstanding} color="red" icon={AlertTriangle} sub="belum lunas" />
              <MiniStat label="Sisa Belum Dibayar" value={formatRupiah(totalKasbonSisa)} color="red" icon={AlertTriangle} />
            </div>
          </div>

          {/* INVENTARIS */}
          <div>
            <SectionTitle icon={Package} title="Inventaris Barang" color="text-purple-700" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MiniStat label="Barang Masuk" value={`${stokMasuk.length} transaksi`} sub={`${totalMasukQty} unit`} color="green" icon={ArrowDownCircle} />
              <MiniStat label="Barang Keluar" value={`${stokKeluar.length} transaksi`} sub={`${totalKeluarQty} unit`} color="amber" icon={ArrowUpCircle} />
              <MiniStat label="Permintaan Diajukan" value={permintaanData.length} sub={`${permintaanPending} pending`} color="purple" icon={ShoppingCart} />
              <MiniStat label="Disetujui" value={permintaanDisetujui} sub={`dari ${permintaanData.length} total`} color="blue" icon={CheckCircle2} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title={`Barang Masuk (${totalMasukQty} unit)`}>
                {stokMasuk.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Tidak ada barang masuk</p> : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {stokMasuk.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
                        <ArrowDownCircle size={13} className="text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-800 truncate">{s.barang?.nama_barang}</p><p className="text-xs text-gray-400">{formatTanggal(s.created_at)}</p></div>
                        <span className="text-xs font-bold text-green-700 flex-shrink-0">+{s.jumlah} {s.barang?.satuan_barang?.singkatan || 'unit'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title={`Barang Keluar (${totalKeluarQty} unit)`}>
                {stokKeluar.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Tidak ada barang keluar</p> : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {stokKeluar.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                        <ArrowUpCircle size={13} className="text-amber-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-800 truncate">{s.barang?.nama_barang}</p><p className="text-xs text-gray-400">{formatTanggal(s.created_at)}</p></div>
                        <span className="text-xs font-bold text-amber-700 flex-shrink-0">−{s.jumlah} {s.barang?.satuan_barang?.singkatan || 'unit'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {loaded && !project && <AlertInPage type="info" title="Project tidak ditemukan" message="Project yang dipilih tidak ditemukan." />}
      {!selectedProject && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center"><Building2 size={28} className="text-gray-300" /></div>
          <p className="text-sm font-semibold text-gray-400">Pilih project dan klik Tampilkan</p>
          <p className="text-xs text-gray-300">Progress, kehadiran, gaji (per jabatan), lembur, kasbon, dan inventaris per project</p>
        </div>
      )}
    </div>
  )
}
