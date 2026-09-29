import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell,
} from 'recharts'
import { Play, Save, Download, PackageSearch, Trophy } from 'lucide-react'
import { Card, Table, PageHeader, Button, Modal, StatCard, DropdownSelect, FormField } from '../common'
import { useProject } from '../../context/ProjectContext'
import { runTask, cancelTasks } from '../../ml/runTask'
import { RISK_ORDER } from '../../ml/inventoryPolicy'
import { loadMaterialData, saveForecastRun, forecastVsActual } from '../../services/mlService'
import { exportToExcel } from '../../utils/exportService'
import { Notice, SetupNotice, DemoBanner, SourceToggle, ProgressBar, TabBar, RiskBadge, fmt, pct, tgl } from './aiShared'

const opt = (arr) => arr.map(([value, label]) => ({ value, label }))
const HORIZON = opt([[4, '4 minggu'], [8, '8 minggu']])
const LEAD = opt([[1, '1 minggu'], [2, '2 minggu'], [3, '3 minggu'], [4, '4 minggu']])
const SERVICE = opt([[90, '90%'], [95, '95%'], [99, '99%']])
const HISTORY = opt([[26, '26 minggu'], [39, '39 minggu'], [52, '52 minggu']])

const POLA = {
  smooth: 'Stabil (smooth)', erratic: 'Berfluktuasi (erratic)', intermittent: 'Putus-putus (intermiten)',
  lumpy: 'Sporadis & besar (lumpy)', jarang: 'Sangat jarang dipakai',
}

export default function PeramalanMaterial() {
  const { activeProject } = useProject()
  const [source, setSource] = useState('sistem')
  const [params, setParams] = useState({ horizon: 4, leadTime: 1, service: 95, historyWeeks: 52, nOrigins: 5 })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ p: 0, label: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('rekomendasi')
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveInfo, setSaveInfo] = useState(null)
  const [akurasi, setAkurasi] = useState({ loading: false, data: null, error: null, missing: false })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelTasks() } }, [])

  const set = (k) => (v) => setParams((p) => ({ ...p, [k]: v }))

  const run = useCallback(async () => {
    setRunning(true); setError(null); setSaveInfo(null); setResult(null); setProgress({ p: 0.02, label: 'Memuat data…' })
    try {
      let data
      if (source === 'demo') {
        data = await runTask('demoMaterial', { items: 18, weeks: params.historyWeeks, seed: 7 })
        data.meta = { exogTersedia: true, nTransaksi: null }
      } else {
        if (!activeProject) throw new Error('Pilih proyek aktif terlebih dahulu (menu di bagian atas).')
        data = await loadMaterialData(activeProject.id, { weeks: params.historyWeeks })
        if (!data.items.length) throw new Error('Proyek ini belum memiliki data barang.')
      }
      const hasil = await runTask('forecast', {
        weeks: data.weeks, items: data.items, horizon: params.horizon, nOrigins: params.nOrigins,
        leadTimeWeeks: params.leadTime, serviceLevel: params.service, useExog: !!data.meta?.exogTersedia,
      }, { onProgress: (p, label) => alive.current && setProgress({ p, label }) })
      if (!alive.current) return
      setResult({ hasil, sumber: source, meta: data.meta, proyek: activeProject?.nama_project })
      setTab('rekomendasi')
    } catch (e) {
      if (alive.current && e.message !== 'Dibatalkan') setError(e.message)
    } finally {
      if (alive.current) setRunning(false)
    }
  }, [source, params, activeProject])

  const rows = useMemo(() => {
    if (!result?.hasil.ok) return []
    return [...result.hasil.items].sort((a, b) =>
      RISK_ORDER[a.rekomendasi.risiko] - RISK_ORDER[b.rekomendasi.risiko] || b.rekomendasi.orderQty - a.rekomendasi.orderQty)
  }, [result])

  const count = (r) => rows.filter((x) => x.rekomendasi.risiko === r).length

  const onSave = async () => {
    setSaving(true); setSaveInfo(null)
    try {
      const r = await saveForecastRun(result.hasil, activeProject.id)
      setSaveInfo({ ok: true, msg: `Tersimpan: ${r.nForecast} baris ramalan & ${r.nRekomendasi} rekomendasi.` })
      toast.success('Hasil peramalan disimpan')
    } catch (e) {
      if (e.code === 'ML_TABLE_MISSING') setSaveInfo({ missing: true })
      else { setSaveInfo({ ok: false, msg: e.message }); toast.error(e.message) }
    } finally { setSaving(false) }
  }

  const loadAkurasi = useCallback(async () => {
    if (source !== 'sistem' || !activeProject) return
    setAkurasi({ loading: true, data: null, error: null, missing: false })
    try {
      const data = await forecastVsActual(activeProject.id)
      setAkurasi({ loading: false, data, error: null, missing: false })
    } catch (e) {
      setAkurasi({ loading: false, data: null, error: e.code === 'ML_TABLE_MISSING' ? null : e.message, missing: e.code === 'ML_TABLE_MISSING' })
    }
  }, [source, activeProject])
  useEffect(() => { if (tab === 'akurasi') loadAkurasi() }, [tab, loadAkurasi])

  const exportXlsx = () => {
    exportToExcel('Rekomendasi Pengadaan',
      ['Barang', 'Satuan', 'Stok', `Ramalan ${params.horizon} minggu`, 'Titik Pesan Ulang', 'Stok Pengaman', 'Saran Pesan', 'Perkiraan Habis', 'Risiko', 'Model'],
      rows.map((r) => [r.nama, r.satuan, r.stok, Math.round(r.rekomendasi.totalForecast), r.rekomendasi.reorderPoint, r.rekomendasi.safetyStock, r.rekomendasi.orderQty, r.rekomendasi.stockoutWeek || '-', r.rekomendasi.risiko, r.modelNama]))
  }

  const columns = [
    { header: 'Barang', render: (r) => (<div><p className="font-semibold text-gray-900">{r.nama}</p><p className="text-xs text-gray-400">{POLA[r.pola.category] || r.pola.category}</p></div>) },
    { header: 'Stok', className: 'text-right', render: (r) => `${fmt(r.stok, 0)} ${r.satuan || ''}` },
    { header: `Ramalan ${result?.hasil.parameter.horizon || ''} mgg`, className: 'text-right', render: (r) => fmt(r.rekomendasi.totalForecast, 0) },
    { header: 'Titik pesan ulang', className: 'text-right', render: (r) => fmt(r.rekomendasi.reorderPoint, 0) },
    { header: 'Saran pesan', className: 'text-right font-semibold', render: (r) => (r.rekomendasi.orderQty > 0 ? <span className="text-blue-700">{fmt(r.rekomendasi.orderQty, 0)}</span> : '—') },
    { header: 'Perkiraan habis', render: (r) => (r.rekomendasi.stockoutWeek ? tgl(r.rekomendasi.stockoutWeek) : '—') },
    { header: 'Risiko', render: (r) => <RiskBadge risiko={r.rekomendasi.risiko} /> },
    { header: '', render: (r) => <button onClick={() => setDetail(r)} className="text-xs font-bold text-blue-700 hover:underline">Detail</button> },
  ]

  const evalRows = result?.hasil.ok ? [...result.hasil.evaluasi].sort((a, b) => (a.mase ?? 99) - (b.mase ?? 99)) : []
  const best = evalRows.find((m) => m.id === result?.hasil.modelTerbaik)
  const lama = evalRows.find((m) => m.id === 'rf_lama')

  return (
    <div className="space-y-5">
      <PageHeader title="Peramalan Kebutuhan Material" subtitle={`Sistem cerdas • ${activeProject?.nama_project || 'Pilih proyek'}`}
        action={<SourceToggle value={source} onChange={(v) => { setSource(v); setResult(null); setError(null) }} />} />

      {source === 'demo' && <DemoBanner />}
      {source === 'sistem' && !activeProject && (
        <Notice tone="warn" title="Belum ada proyek terpilih">
          Pilih proyek pada menu <b>Pilih Project</b> di pojok kanan atas. Bila daftarnya kosong, pastikan sudah ada proyek di menu <b>Master Data → Project</b> (dan muat ulang halaman), atau coba <b>Data demo</b>.
        </Notice>
      )}

      <Card title="Parameter analisis">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <FormField label="Horizon ramalan"><DropdownSelect value={params.horizon} onChange={set('horizon')} options={HORIZON} /></FormField>
          <FormField label="Waktu tunggu pengadaan"><DropdownSelect value={params.leadTime} onChange={set('leadTime')} options={LEAD} /></FormField>
          <FormField label="Tingkat layanan"><DropdownSelect value={params.service} onChange={set('service')} options={SERVICE} /></FormField>
          <FormField label="Riwayat data"><DropdownSelect value={params.historyWeeks} onChange={set('historyWeeks')} options={HISTORY} /></FormField>
          <div className="flex items-end">
            <Button icon={Play} onClick={run} loading={running} className="w-full">{running ? 'Menganalisis…' : 'Jalankan Analisis'}</Button>
          </div>
        </div>
        {running && <div className="mt-5"><ProgressBar p={progress.p} label={progress.label} /></div>}
        <p className="text-xs text-gray-400 mt-4">
          Model dievaluasi dengan validasi <b>rolling-origin</b> (menguji pada minggu yang belum dilihat model), lalu model terbaik dipakai meramal.
          Minggu berjalan yang belum lengkap tidak diikutkan.
        </p>
      </Card>

      {error && <Notice tone="danger" title="Analisis gagal">{error}</Notice>}
      {result && !result.hasil.ok && <Notice tone="warn" title="Data belum cukup">{result.hasil.alasan}</Notice>}
      {result?.meta?.nTransaksi !== null && result?.meta?.nTransaksi !== undefined && result.meta.nTransaksi < 30 && result.hasil.ok && (
        <Notice tone="warn" title="Data pemakaian masih sedikit">Hanya {result.meta.nTransaksi} transaksi stok keluar pada periode ini. Ramalan kurang dapat diandalkan; gunakan sebagai gambaran awal.</Notice>
      )}

      {!result && !running && !error && (
        <Card><div className="text-center py-10 text-gray-400">
          <PackageSearch size={36} className="mx-auto mb-3 text-blue-200" />
          <p className="font-semibold text-gray-600">Belum ada hasil analisis</p>
          <p className="text-sm mt-1">Atur parameter lalu tekan <b>Jalankan Analisis</b>. Proses berjalan di latar belakang; halaman tetap dapat dipakai.</p>
        </div></Card>
      )}

      {result?.hasil.ok && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Barang dianalisis" value={rows.length} sub={`${result.hasil.parameter.nWeeks} minggu riwayat`} color="blue" />
            <StatCard label="Habis / Kritis" value={count('habis') + count('kritis')} sub="perlu dipesan sekarang" color="red" />
            <StatCard label="Waspada" value={count('waspada')} sub={`kurang untuk ${result.hasil.parameter.horizon} minggu`} color="amber" />
            <StatCard label="Aman" value={count('aman')} sub="stok mencukupi" color="green" />
          </div>

          <Card>
            <TabBar value={tab} onChange={setTab} tabs={[
              { id: 'rekomendasi', label: 'Rekomendasi Pengadaan' },
              { id: 'evaluasi', label: 'Evaluasi Model' },
              { id: 'akurasi', label: 'Akurasi Berjalan' },
            ]} />

            {tab === 'rekomendasi' && (
              <>
                <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
                  <p className="text-sm text-gray-500">Diurutkan dari yang paling mendesak. Klik <b>Detail</b> untuk grafik & alasan.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" icon={Download} onClick={exportXlsx}>Ekspor Excel</Button>
                    {result.sumber === 'sistem' && (
                      <Button size="sm" icon={Save} onClick={onSave} loading={saving}>Simpan hasil</Button>
                    )}
                  </div>
                </div>
                {saveInfo?.missing && <SetupNotice />}
                {saveInfo?.ok && <Notice tone="success" className="mb-4">{saveInfo.msg}</Notice>}
                {saveInfo && saveInfo.ok === false && <Notice tone="danger" className="mb-4">{saveInfo.msg}</Notice>}
                <Table columns={columns} data={rows} emptyMessage="Tidak ada barang" />
              </>
            )}

            {tab === 'evaluasi' && (
              <EvaluasiModel evalRows={evalRows} best={best} lama={lama} cakupan={result.hasil.cakupanInterval} nOrigins={result.hasil.parameter.nOrigins} demo={result.sumber === 'demo'} />
            )}

            {tab === 'akurasi' && (
              <AkurasiBerjalan state={akurasi} sumber={result.sumber} onReload={loadAkurasi} />
            )}
          </Card>
        </>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Ramalan: ${detail.nama}` : ''} size="lg">
        {detail && <DetailBarang item={detail} weeks={result.hasil.weeks} />}
      </Modal>
    </div>
  )
}

// ───────────────────────── Detail barang ─────────────────────────
function DetailBarang({ item, weeks }) {
  const n = Math.min(26, item.values.length)
  const hist = weeks.slice(-n).map((w, i) => ({ minggu: w.slice(5), aktual: item.values[item.values.length - n + i] }))
  const fc = item.forecast.map((f) => ({ minggu: f.minggu.slice(5), yhat: f.yhat, low: f.low, band: Math.max(0, f.high - f.low) }))
  // titik sambung agar garis ramalan menyatu dengan garis aktual
  const last = hist[hist.length - 1]
  const data = [...hist.slice(0, -1), { ...last, yhat: last.aktual, low: last.aktual, band: 0 }, ...fc]
  const r = item.rekomendasi
  return (
    <div className="space-y-5">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf2" />
            <XAxis dataKey="minggu" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, name) => [fmt(v, 1), { aktual: 'Pemakaian aktual', yhat: 'Ramalan', low: 'Batas bawah (10%)', band: 'Lebar interval' }[name] || name]} />
            <Area dataKey="low" stackId="i" stroke="none" fill="transparent" />
            <Area dataKey="band" stackId="i" stroke="none" fill="#93b4f0" fillOpacity={0.35} name="Interval 80%" />
            <Line dataKey="aktual" stroke="#364b8c" strokeWidth={2} dot={false} connectNulls />
            <Line dataKey="yhat" stroke="#e8a23a" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
            {item.stok > 0 && <ReferenceLine y={item.stok} stroke="#e06a6a" strokeDasharray="4 4" label={{ value: `Stok ${fmt(item.stok, 0)}`, fontSize: 10, fill: '#e06a6a', position: 'insideTopRight' }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-400 -mt-2">Garis biru = pemakaian aktual, garis kuning putus-putus = ramalan, pita biru muda = interval ketidakpastian 80%.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {[['Titik pesan ulang', fmt(r.reorderPoint, 0)], ['Stok pengaman', fmt(r.safetyStock, 0)], ['Saran pesan', fmt(r.orderQty, 0)], ['Perkiraan habis', r.stockoutWeek ? tgl(r.stockoutWeek) : '—']].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-blue-50/60 border border-blue-100 p-3"><p className="text-xs text-gray-500">{k}</p><p className="font-extrabold text-gray-900">{v} {k !== 'Perkiraan habis' ? item.satuan : ''}</p></div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2"><RiskBadge risiko={r.risiko} /><span className="text-sm font-bold text-gray-800">Alasan</span></div>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">{r.alasan.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>

      <div className="text-xs text-gray-500 border-t border-gray-100 pt-3 space-y-1">
        <p><b>Model:</b> {item.modelNama}{Number.isFinite(item.mase) && <> — MASE {fmt(item.mase, 2)} {item.mase < 1 ? '(lebih baik dari naive)' : '(belum mengalahkan naive)'}</>}</p>
        <p><b>Pola permintaan:</b> {POLA[item.pola.category]} (ADI {fmt(item.pola.adi, 2)}, CV² {fmt(item.pola.cv2, 2)}; {item.pola.nonZero} dari {item.values.length} minggu ada pemakaian)</p>
      </div>
    </div>
  )
}

// ───────────────────────── Evaluasi model ─────────────────────────
function EvaluasiModel({ evalRows, best, lama, cakupan, nOrigins, demo }) {
  const chart = evalRows.filter((m) => Number.isFinite(m.mase)).map((m) => ({ nama: m.nama.replace(/ \(.*\)/, ''), mase: Number(m.mase.toFixed(3)), id: m.id }))
  const gain = best && lama && Number.isFinite(best.mase) && Number.isFinite(lama.mase) ? (lama.mase - best.mase) / lama.mase : null
  return (
    <div className="space-y-5">
      {demo && <Notice tone="warn" title="Catatan data demo">Pada data sintetis, model yang memakai tenaga kerja unggul karena generator membuat kebutuhan bergantung pada tenaga kerja. Ini memperagakan mekanisme, bukan bukti kinerja di lapangan.</Notice>}
      {best && (
        <Notice tone="info" title={<span className="inline-flex items-center gap-1.5"><Trophy size={14} /> Model terbaik: {best.nama}</span>}>
          MASE {fmt(best.mase, 3)} ({best.mase < 1 ? 'lebih baik daripada ramalan naive' : 'belum mengalahkan naive'}), RMSE {fmt(best.rmse, 2)}, WAPE {pct(best.wape)}.
          {gain !== null && lama.id !== best.id && (
            <> Dibanding <b>metode lama</b> (Random Forest lag-4 pada halaman Prediksi Stok): MASE {fmt(lama.mase, 3)} → {gain > 0 ? <b>lebih baik {pct(gain)}</b> : <b>tidak lebih baik ({pct(-gain)} lebih buruk)</b>}.</>
          )}
        </Notice>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
            {['Model', 'Jenis', 'MAE', 'RMSE', 'WAPE', 'MASE', 'Bias', 'Peringkat rata-rata', 'Menang'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {evalRows.map((m) => (
              <tr key={m.id} className={m.id === best?.id ? 'bg-blue-50/60' : ''}>
                <td className="px-3 py-2.5 font-semibold text-gray-800">{m.nama}{m.id === best?.id && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-700 text-white">TERBAIK</span>}{m.id === 'rf_lama' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">METODE LAMA</span>}</td>
                <td className="px-3 py-2.5 text-gray-500">{m.kelompok}</td>
                <td className="px-3 py-2.5">{fmt(m.mae, 2)}</td><td className="px-3 py-2.5">{fmt(m.rmse, 2)}</td>
                <td className="px-3 py-2.5">{pct(m.wape)}</td><td className="px-3 py-2.5 font-bold">{fmt(m.mase, 3)}</td>
                <td className="px-3 py-2.5">{fmt(m.bias, 2)}</td><td className="px-3 py-2.5">{fmt(m.meanRank, 2)}</td><td className="px-3 py-2.5">{m.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="h-56">
        <p className="text-xs font-bold text-gray-500 mb-2">MASE per model (lebih kecil = lebih baik; garis 1,0 = setara naive)</p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chart} layout="vertical" margin={{ left: 20, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf2" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} /><YAxis dataKey="nama" type="category" width={170} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => fmt(v, 3)} />
            <ReferenceLine x={1} stroke="#e06a6a" strokeDasharray="4 4" />
            <Bar dataKey="mase" radius={[0, 6, 6, 0]}>{chart.map((c) => <Cell key={c.id} fill={c.id === best?.id ? '#4f6fc7' : c.id === 'rf_lama' ? '#9aa4bd' : '#b6c6ee'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="font-bold text-gray-800 mb-1">Cakupan interval 80%</p>
          {Number.isFinite(cakupan?.picp)
            ? <p className="text-gray-600">Realisasi jatuh di dalam interval pada <b>{pct(cakupan.picp)}</b> kasus uji (target ≈ 80%). Lebar rata-rata interval ≈ {fmt(cakupan.width, 2)}× rata-rata pemakaian.</p>
            : <p className="text-gray-500">Belum cukup titik asal untuk mengukur cakupan.</p>}
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="font-bold text-gray-800 mb-1">Cara membaca</p>
          <p className="text-gray-600">Setiap model diuji pada {nOrigins} titik waktu berurutan tanpa melihat masa depan. <b>MASE</b> &lt; 1 berarti lebih baik dari ramalan “sama seperti minggu lalu”. <b>WAPE</b> = total galat ÷ total pemakaian (lebih tepat daripada MAPE untuk data yang sering nol).</p>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Akurasi berjalan ─────────────────────────
function AkurasiBerjalan({ state, sumber, onReload }) {
  if (sumber === 'demo') return <Notice tone="info">Pemantauan akurasi hanya tersedia untuk data sistem: ramalan disimpan, lalu dibandingkan dengan pemakaian aktual seiring berjalannya waktu.</Notice>
  if (state.loading) return <p className="text-sm text-gray-400 py-6 text-center">Memuat…</p>
  if (state.missing) return <SetupNotice />
  if (state.error) return <Notice tone="danger">{state.error}</Notice>
  const d = state.data
  if (!d) return null
  const tone = d.drift.status === 'memburuk' ? 'warn' : d.drift.status === 'stabil' ? 'success' : 'info'
  return (
    <div className="space-y-4">
      <Notice tone={tone} title="Pemantauan pergeseran akurasi">{d.drift.pesan}</Notice>
      {d.runs.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Belum ada ramalan yang minggu targetnya sudah selesai. Simpan hasil analisis hari ini, lalu kembali setelah 1–2 minggu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">{['Tanggal analisis', 'Pasangan dinilai', 'MAE', 'WAPE', 'Bias'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{d.runs.map((r) => (
              <tr key={r.dibuat_pada}><td className="px-3 py-2.5 font-semibold">{tgl(r.dibuat_pada)}</td><td className="px-3 py-2.5">{r.n}</td><td className="px-3 py-2.5">{fmt(r.mae, 2)}</td><td className="px-3 py-2.5">{pct(r.wape)}</td><td className="px-3 py-2.5">{fmt(r.bias, 2)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="text-right"><Button variant="ghost" size="sm" onClick={onReload}>Muat ulang</Button></div>
    </div>
  )
}
