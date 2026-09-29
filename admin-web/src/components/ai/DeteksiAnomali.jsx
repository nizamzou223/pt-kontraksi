import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Play, Save, ShieldAlert, Check, X, EyeOff, FlaskConical } from 'lucide-react'
import { Card, Table, PageHeader, Button, Modal, StatCard, DropdownSelect, FormField } from '../common'
import { useProject } from '../../context/ProjectContext'
import { useAuth } from '../../context/AuthContext'
import { runTask, cancelTasks } from '../../ml/runTask'
import {
  loadWorkforceData, saveAnomalies, listAnomalies, reviewAnomaly, getReviewedKeys,
} from '../../services/mlService'
import { Notice, SetupNotice, DemoBanner, SourceToggle, ProgressBar, TabBar, TingkatBadge, fmt, pct, tgl } from './aiShared'

const opt = (arr) => arr.map(([value, label]) => ({ value, label }))
const PERIODE = opt([[7, '7 hari terakhir'], [14, '14 hari terakhir'], [30, '30 hari terakhir'], [60, '60 hari terakhir']])
const SCOPE = opt([['aktif', 'Proyek aktif'], ['semua', 'Semua proyek']])
const SUMBER_LABEL = { presensi: 'Presensi', lembur: 'Lembur', kasbon: 'Kasbon', rekap_gaji_mingguan: 'Gaji mingguan' }
const SUMBER_OPT = opt([['semua', 'Semua sumber'], ['presensi', 'Presensi'], ['lembur', 'Lembur'], ['kasbon', 'Kasbon'], ['rekap_gaji_mingguan', 'Gaji mingguan']])
const TINGKAT_OPT = opt([['semua', 'Semua tingkat'], ['tinggi', 'Tinggi'], ['sedang', 'Sedang'], ['rendah', 'Rendah']])
const METODE_LABEL = { 'aturan bisnis': 'Aturan bisnis', statistik: 'Statistik', 'isolation forest': 'Isolation Forest' }

const isoDate = (d) => new Date(d).toISOString().slice(0, 10)
const addDays = (s, n) => isoDate(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000)

const SumberChip = ({ s }) => <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600">{SUMBER_LABEL[s] || s}</span>
const ScoreBar = ({ v }) => (
  <div className="flex items-center gap-2 min-w-[96px]">
    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: v >= 0.75 ? '#e06a6a' : v >= 0.5 ? '#e8a23a' : '#5b9bd5' }} /></div>
    <span className="text-xs font-bold text-gray-700 tabular-nums">{fmt(v, 2)}</span>
  </div>
)

export default function DeteksiAnomali() {
  const { activeProject } = useProject()
  const [source, setSource] = useState('sistem')
  const [params, setParams] = useState({ days: 30, scope: 'aktif', threshold: 0.5, rules: true, stats: true, iforest: true })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ p: 0, label: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('hasil')
  const [filter, setFilter] = useState({ tingkat: 'semua', sumber: 'semua' })
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveInfo, setSaveInfo] = useState(null)
  const [pendingCount, setPendingCount] = useState(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelTasks() } }, [])

  const set = (k) => (v) => setParams((p) => ({ ...p, [k]: v }))

  const run = useCallback(async () => {
    setRunning(true); setError(null); setSaveInfo(null); setResult(null); setProgress({ p: 0.15, label: 'Memuat data…' })
    try {
      let data, from, to, labels = null
      if (source === 'demo') {
        data = await runTask('demoWorkforce', { employees: 30, days: 60, seed: 21, difficulty: 'sulit' })
        labels = new Map(data.labels)
        to = data.today; from = addDays(to, -(params.days - 1))
      } else {
        to = isoDate(new Date()); from = addDays(to, -(params.days - 1))
        data = await loadWorkforceData({ projectId: params.scope === 'aktif' ? activeProject?.id ?? null : null, from, to })
      }
      setProgress({ p: 0.55, label: 'Menjalankan deteksi…' })
      const reviewed = source === 'sistem' ? await getReviewedKeys() : new Set()
      const res = await runTask('anomali', {
        karyawan: data.karyawan, presensi: data.presensi, lembur: data.lembur, kasbon: data.kasbon, gaji: data.gaji,
        today: data.today, threshold: params.threshold, reviewed,
        methods: { rules: params.rules, stats: params.stats, iforest: params.iforest },
      })
      if (!alive.current) return
      // Riwayat sebelum periode hanya untuk baseline → laporkan hanya tanggal dalam periode
      const items = res.items.filter((i) => i.tanggal >= from)
      const inRange = (d) => d >= from
      const diperiksa = {
        presensi: data.presensi.filter((p) => p.metode_input !== 'otomatis' && inRange(p.tanggal)).length,
        lembur: data.lembur.filter((l) => !/^otomatis/i.test(l.catatan || '') && inRange(l.tanggal)).length,
        kasbon: data.kasbon.filter((k) => inRange(k.tanggal_kasbon)).length,
        gaji: data.gaji.filter((g) => inRange(g.periode_mulai)).length,
      }
      setResult({ items, ringkasan: { ...res.ringkasan, diperiksa }, from, to, labels, sumber: source, threshold: params.threshold })
      setTab('hasil')
    } catch (e) {
      if (alive.current && e.message !== 'Dibatalkan') setError(e.message)
    } finally {
      if (alive.current) setRunning(false)
    }
  }, [source, params, activeProject])

  const shown = useMemo(() => (result?.items || []).filter((i) =>
    (filter.tingkat === 'semua' || i.tingkat === filter.tingkat) && (filter.sumber === 'semua' || i.sumber_tabel === filter.sumber)), [result, filter])

  const perTingkat = useMemo(() => {
    const c = { tinggi: 0, sedang: 0, rendah: 0 }
    for (const i of result?.items || []) c[i.tingkat]++
    return c
  }, [result])

  const onSave = async () => {
    setSaving(true); setSaveInfo(null)
    try {
      const r = await saveAnomalies(result.items)
      setSaveInfo({ ok: true, msg: `${r.inserted} penanda baru disimpan, ${r.updated} diperbarui, ${r.dilewati} dilewati (sudah ditinjau admin).` })
      toast.success('Disimpan ke Pusat Tinjauan')
    } catch (e) {
      if (e.code === 'ML_TABLE_MISSING') setSaveInfo({ missing: true }); else { setSaveInfo({ ok: false, msg: e.message }); toast.error(e.message) }
    } finally { setSaving(false) }
  }

  const columns = [
    { header: 'Tanggal', render: (r) => <span className="whitespace-nowrap">{tgl(r.tanggal)}</span> },
    { header: 'Karyawan', render: (r) => <span className="font-semibold text-gray-900">{r.nama_karyawan || '—'}</span> },
    { header: 'Sumber', render: (r) => <SumberChip s={r.sumber_tabel} /> },
    { header: 'Skor', render: (r) => <ScoreBar v={r.skor} /> },
    { header: 'Tingkat', render: (r) => <TingkatBadge tingkat={r.tingkat} /> },
    { header: 'Alasan utama', className: 'max-w-md', render: (r) => (
      <div><p className="text-sm text-gray-700 line-clamp-2">{r.alasan[0]?.teks}</p>{r.alasan.length > 1 && <p className="text-xs text-blue-700 font-semibold mt-0.5">+{r.alasan.length - 1} alasan lain</p>}</div>) },
    ...(result?.labels ? [{ header: 'Kebenaran (demo)', render: (r) => (result.labels.has(r.key)
      ? <span className="text-xs font-bold text-emerald-700">Anomali sungguhan</span> : <span className="text-xs font-bold text-gray-400">Positif palsu</span>) }] : []),
    { header: '', render: (r) => <button onClick={() => setDetail(r)} className="text-xs font-bold text-blue-700 hover:underline">Detail</button> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Deteksi Anomali Data Kepegawaian" subtitle="Sistem cerdas • presensi, lembur, kasbon, dan gaji"
        action={<SourceToggle value={source} onChange={(v) => { setSource(v); setResult(null); setError(null) }} />} />
      {source === 'demo' && <DemoBanner />}
      {source === 'sistem' && params.scope === 'aktif' && !activeProject && (
        <Notice tone="warn" title="Belum ada proyek terpilih">
          Pilih proyek di pojok kanan atas, atau ubah <b>Cakupan</b> menjadi <b>Semua proyek</b>.
        </Notice>
      )}

      <Card title="Parameter deteksi">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <FormField label="Periode"><DropdownSelect value={params.days} onChange={set('days')} options={PERIODE} /></FormField>
          <FormField label="Cakupan"><DropdownSelect value={source === 'demo' ? 'semua' : params.scope} onChange={set('scope')} options={SCOPE} disabled={source === 'demo'} /></FormField>
          <FormField label={`Sensitivitas: skor ≥ ${fmt(params.threshold, 2)}`} help="Lebih rendah = lebih banyak penanda (recall naik, presisi turun)">
            <input type="range" min="0.3" max="0.9" step="0.05" value={params.threshold} onChange={(e) => set('threshold')(Number(e.target.value))}
              aria-label="Ambang skor" className="w-full accent-blue-700" />
          </FormField>
          <div className="flex items-end"><Button icon={Play} onClick={run} loading={running} className="w-full">{running ? 'Memeriksa…' : 'Jalankan Deteksi'}</Button></div>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          {[['rules', 'Aturan bisnis'], ['stats', 'Statistik robust'], ['iforest', 'Isolation Forest']].map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2 text-gray-600 cursor-pointer">
              <input type="checkbox" checked={params[k]} onChange={(e) => set(k)(e.target.checked)} className="w-4 h-4 accent-blue-700" /> {label}
            </label>
          ))}
        </div>
        {running && <div className="mt-5"><ProgressBar p={progress.p} label={progress.label} /></div>}
        <p className="text-xs text-gray-400 mt-4">Presensi <b>otomatis</b> (alfa otomatis) dan lembur bentukan sistem tidak diperiksa karena bukan observasi nyata. Penanda hanyalah <b>saran</b> — keputusan akhir ada pada admin.</p>
      </Card>

      {error && <Notice tone="danger" title="Deteksi gagal">{error}</Notice>}

      {!result && !running && !error && (
        <Card><div className="text-center py-10 text-gray-400">
          <ShieldAlert size={36} className="mx-auto mb-3 text-blue-200" />
          <p className="font-semibold text-gray-600">Belum ada hasil deteksi</p>
          <p className="text-sm mt-1">Pilih periode lalu tekan <b>Jalankan Deteksi</b>.</p>
        </div></Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Data diperiksa" value={fmt(Object.values(result.ringkasan.diperiksa).reduce((a, b) => a + b, 0), 0)}
              sub={`presensi ${result.ringkasan.diperiksa.presensi} • lembur ${result.ringkasan.diperiksa.lembur} • kasbon ${result.ringkasan.diperiksa.kasbon}`} color="blue" />
            <StatCard label="Ditandai" value={result.items.length} sub={`${tgl(result.from)} – ${tgl(result.to)}`} color="amber" />
            <StatCard label="Tingkat tinggi" value={perTingkat.tinggi} sub="skor ≥ 0,75" color="red" />
            <StatCard label="Tingkat sedang" value={perTingkat.sedang} sub="skor 0,50 – 0,75" color="purple" />
          </div>

          <Card>
            <TabBar value={tab} onChange={setTab} tabs={[
              { id: 'hasil', label: 'Hasil Deteksi', badge: result.items.length },
              { id: 'tinjauan', label: 'Pusat Tinjauan', badge: pendingCount },
              { id: 'metode', label: 'Metode & Evaluasi' },
            ]} />
            {tab === 'hasil' && (
              <>
                <div className="flex flex-wrap gap-3 items-end justify-between mb-4">
                  <div className="flex gap-3 w-full sm:w-auto">
                    <div className="w-44"><DropdownSelect value={filter.tingkat} onChange={(v) => setFilter((f) => ({ ...f, tingkat: v }))} options={TINGKAT_OPT} /></div>
                    <div className="w-44"><DropdownSelect value={filter.sumber} onChange={(v) => setFilter((f) => ({ ...f, sumber: v }))} options={SUMBER_OPT} /></div>
                  </div>
                  {result.sumber === 'sistem' && <Button size="sm" icon={Save} onClick={onSave} loading={saving}>Simpan ke Pusat Tinjauan</Button>}
                </div>
                {saveInfo?.missing && <SetupNotice />}
                {saveInfo?.ok && <Notice tone="success" className="mb-4">{saveInfo.msg}</Notice>}
                {saveInfo && saveInfo.ok === false && <Notice tone="danger" className="mb-4">{saveInfo.msg}</Notice>}
                {result.ringkasan.disembunyikan > 0 && <p className="text-xs text-gray-400 mb-3">{result.ringkasan.disembunyikan} penanda disembunyikan karena sudah ditinjau admin sebagai “bukan anomali/diabaikan”.</p>}
                <Table columns={columns} data={shown} emptyMessage="Tidak ada penanda pada periode ini — data tampak wajar." />
              </>
            )}
            {tab === 'tinjauan' && <PusatTinjauan onCount={setPendingCount} />}
            {tab === 'metode' && <EvaluasiAnomali />}
          </Card>
        </>
      )}

      {!result && <Card><TabBarOnly tab={tab} setTab={setTab} setPendingCount={setPendingCount} pendingCount={pendingCount} /></Card>}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detail penanda anomali" size="md">
        {detail && <DetailAnomali item={detail} label={result?.labels?.get(detail.key)} />}
      </Modal>
    </div>
  )
}

// Sebelum analisis dijalankan, Pusat Tinjauan & Metode tetap dapat dibuka
function TabBarOnly({ tab, setTab, setPendingCount, pendingCount }) {
  const t = tab === 'hasil' ? 'tinjauan' : tab
  return (
    <>
      <TabBar value={t} onChange={setTab} tabs={[{ id: 'tinjauan', label: 'Pusat Tinjauan', badge: pendingCount }, { id: 'metode', label: 'Metode & Evaluasi' }]} />
      {t === 'tinjauan' ? <PusatTinjauan onCount={setPendingCount} /> : <EvaluasiAnomali />}
    </>
  )
}

function DetailAnomali({ item, label }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TingkatBadge tingkat={item.tingkat} /><SumberChip s={item.sumber_tabel} />
        <span className="text-gray-500">{tgl(item.tanggal)} • <b className="text-gray-800">{item.nama_karyawan || '—'}</b></span>
      </div>
      <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Skor anomali</p><ScoreBar v={item.skor} /></div>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Mengapa ditandai ({item.alasan.length})</p>
        <ul className="space-y-2">
          {item.alasan.map((a, i) => (
            <li key={i} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-1"><span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">{METODE_LABEL[a.metode] || a.metode}</span><span className="text-[10px] text-gray-400 font-mono">{a.kode}</span><span className="ml-auto text-xs font-bold text-gray-500">bobot {fmt(a.bobot, 2)}</span></div>
              <p className="text-gray-700 leading-relaxed">{a.teks}</p>
            </li>
          ))}
        </ul>
      </div>
      {label !== undefined && <Notice tone="info">Data demo: penanda ini {label ? <>memang anomali yang disuntikkan (<b>{label}</b>).</> : <b>positif palsu</b>}.</Notice>}
      <p className="text-xs text-gray-400">Skor menggabungkan bukti dari beberapa metode (noisy-OR): makin banyak bukti yang sepakat, makin tinggi skornya.</p>
    </div>
  )
}

// ───────────────────────── Pusat Tinjauan ─────────────────────────
const STATUS_TABS = opt([['baru', 'Baru'], ['valid', 'Valid'], ['bukan_anomali', 'Bukan anomali'], ['diabaikan', 'Diabaikan'], ['semua', 'Semua']])

function PusatTinjauan({ onCount }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('baru')
  const [state, setState] = useState({ loading: true, rows: [], missing: false, error: null })
  const [review, setReview] = useState(null) // { row, status }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const rows = await listAnomalies({ status })
      setState({ loading: false, rows, missing: false, error: null })
      if (status === 'baru') onCount?.(rows.length)
    } catch (e) {
      setState({ loading: false, rows: [], missing: e.code === 'ML_TABLE_MISSING', error: e.code === 'ML_TABLE_MISSING' ? null : e.message })
    }
  }, [status, onCount])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await reviewAnomaly(review.row.id, review.status, note, user?.id)
      toast.success('Tinjauan disimpan')
      setReview(null); setNote(''); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (state.missing) return <SetupNotice />
  const ACT = [['valid', 'Valid', Check, 'text-emerald-700 hover:bg-emerald-50'], ['bukan_anomali', 'Bukan anomali', X, 'text-blue-700 hover:bg-blue-50'], ['diabaikan', 'Abaikan', EyeOff, 'text-gray-500 hover:bg-gray-100']]
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-4">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} aria-pressed={status === t.value}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${status === t.value ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
      </div>
      {state.error && <Notice tone="danger" className="mb-3">{state.error}</Notice>}
      <Table loading={state.loading} data={state.rows} emptyMessage={status === 'baru' ? 'Tidak ada penanda baru. Jalankan deteksi lalu simpan hasilnya.' : 'Tidak ada data'} columns={[
        { header: 'Tanggal', render: (r) => tgl(r.tanggal) },
        { header: 'Karyawan', render: (r) => <span className="font-semibold text-gray-900">{r.karyawan?.nama_karyawan || '—'}</span> },
        { header: 'Sumber', render: (r) => <SumberChip s={r.sumber_tabel} /> },
        { header: 'Skor', render: (r) => <ScoreBar v={Number(r.skor)} /> },
        { header: 'Alasan', className: 'max-w-sm', render: (r) => <p className="text-sm text-gray-700 line-clamp-2">{r.alasan?.[0]?.teks || '—'}</p> },
        { header: 'Status', render: (r) => <span className="text-xs font-bold text-gray-500">{r.status_tinjauan.replace('_', ' ')}</span> },
        { header: 'Tinjau', render: (r) => (
          <div className="flex gap-1">{ACT.map(([st, label, Icon, cls]) => (
            <button key={st} title={label} aria-label={label} onClick={() => { setReview({ row: r, status: st }); setNote(r.catatan || '') }}
              className={`p-1.5 rounded-lg transition-colors ${cls} ${r.status_tinjauan === st ? 'ring-1 ring-current' : ''}`}><Icon size={15} /></button>))}</div>) },
      ]} />
      <Modal open={!!review} onClose={() => setReview(null)} title="Simpan tinjauan" size="sm">
        {review && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Tandai sebagai <b>{ACT.find((a) => a[0] === review.status)[1]}</b>? Penanda “bukan anomali/abaikan” tidak akan muncul lagi pada analisis berikutnya.</p>
            <FormField label="Catatan (opsional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Mis. lembur disetujui langsung oleh manajer proyek" /></FormField>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReview(null)}>Batal</Button><Button onClick={submit} loading={busy}>Simpan</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ───────────────────────── Metode & Evaluasi ─────────────────────────
function EvaluasiAnomali() {
  const [difficulty, setDifficulty] = useState('sulit')
  const [running, setRunning] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const run = async () => {
    setRunning(true); setError(null)
    try { const r = await runTask('evalAnomali', { employees: 30, days: 60, seed: 21, difficulty, threshold: 0.5 }); if (alive.current) setRes(r) }
    catch (e) { if (alive.current) setError(e.message) } finally { if (alive.current) setRunning(false) }
  }
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-3 gap-4 text-sm">
        {[
          ['Aturan bisnis', 'Pemeriksaan pasti: jam keluar < masuk, lembur tanpa presensi, lembur > 4 jam/hari (PP 35/2021), kasbon > 26 hari gaji, sisa > jumlah, dan sejenisnya. Alasan selalu jelas.'],
          ['Statistik robust', 'Membandingkan nilai dengan kebiasaan karyawan itu sendiri (median & MAD, skor-z robust) — menangkap penyimpangan yang tidak melanggar aturan apa pun. Diberi lantai variasi agar hari kerja panjang yang sah tidak ikut ditandai.'],
          ['Isolation Forest', 'Model tanpa label yang mengisolasi titik langka pada banyak fitur sekaligus (durasi, jam masuk, hari, dsb.) — menangkap kombinasi yang tidak lazim.'],
        ].map(([t, d]) => <div key={t} className="rounded-xl border border-gray-100 p-4"><p className="font-bold text-gray-800 mb-1">{t}</p><p className="text-gray-600 leading-relaxed">{d}</p></div>)}
      </div>

      <Notice tone="warn" title="Batasan penting">
        Evaluasi di bawah memakai data <b>sintetis</b> dengan anomali yang disuntikkan. Ini memeriksa bahwa mekanismenya bekerja dan menunjukkan pertukaran presisi–recall, tetapi
        <b> bukan pengganti evaluasi pada data nyata</b>. Pada data nyata, kualitas diukur dari keputusan admin di Pusat Tinjauan (proporsi “valid” terhadap seluruh penanda).
      </Notice>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-56"><FormField label="Tingkat kesulitan data uji"><DropdownSelect value={difficulty} onChange={setDifficulty} options={opt([['mudah', 'Mudah (anomali mencolok)'], ['sulit', 'Sulit (ada variasi sah mirip anomali)']])} /></FormField></div>
        <Button icon={FlaskConical} onClick={run} loading={running}>Jalankan evaluasi sintetis</Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}

      {res && (
        <div className="space-y-5">
          <p className="text-sm text-gray-500">Data uji: {res.data.presensi} presensi, {res.data.lembur} lembur, {res.data.kasbon} kasbon; <b>{res.data.anomali}</b> anomali disuntikkan (tingkat {res.data.difficulty}); ambang skor 0,5.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">{['Metode', 'ROC-AUC', 'Presisi', 'Recall', 'F1', 'TP', 'FP', 'FN'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{res.evaluasi.hasil.map((h) => (
                <tr key={h.id} className={h.id === 'hibrida' ? 'bg-blue-50/60 font-semibold' : ''}>
                  <td className="px-3 py-2.5">{h.nama}</td><td className="px-3 py-2.5">{fmt(h.auc, 3)}</td><td className="px-3 py-2.5">{pct(h.precision)}</td>
                  <td className="px-3 py-2.5">{pct(h.recall)}</td><td className="px-3 py-2.5">{fmt(h.f1, 3)}</td><td className="px-3 py-2.5">{h.tp}</td><td className="px-3 py-2.5">{h.fp}</td><td className="px-3 py-2.5">{h.fn}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800 mb-2">Sapuan ambang skor (hibrida) — pertukaran presisi vs recall</p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">{['Ambang', 'Presisi', 'Recall', 'F1'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">{res.sweep.rows.map((r) => (
                  <tr key={r.threshold} className={r.threshold === res.sweep.best.threshold ? 'bg-emerald-50/60 font-semibold' : ''}>
                    <td className="px-3 py-2">{fmt(r.threshold, 2)}{r.threshold === res.sweep.best.threshold && <span className="ml-2 text-[10px] text-emerald-700">F1 terbaik</span>}</td>
                    <td className="px-3 py-2">{pct(r.precision)}</td><td className="px-3 py-2">{pct(r.recall)}</td><td className="px-3 py-2">{fmt(r.f1, 3)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
