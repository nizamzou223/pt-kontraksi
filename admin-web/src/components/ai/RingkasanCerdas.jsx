import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageSearch, ShieldAlert, ArrowRight, Database, LineChart, UserCheck, Layers } from 'lucide-react'
import { Card, PageHeader, StatCard } from '../common'
import { ringkasanHub } from '../../services/mlService'
import { Notice, SetupNotice, RiskBadge, tgl } from './aiShared'

function ModulCard({ to, icon: Icon, title, desc, points, tone }) {
  return (
    <Link to={to} className="group block rounded-2xl border border-blue-50 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ boxShadow: '0 1px 6px rgba(79,111,199,0.07)' }}>
      <div className="flex items-start gap-4">
        <div className={`p-3.5 rounded-2xl ${tone}`}><Icon size={24} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-gray-900 text-base">{title}</h3>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{desc}</p>
          <ul className="mt-3 space-y-1 text-xs text-gray-500">{points.map((p) => <li key={p} className="flex gap-2"><span className="text-blue-400">•</span>{p}</li>)}</ul>
          <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-blue-700 group-hover:gap-2.5 transition-all">Buka modul <ArrowRight size={15} /></span>
        </div>
      </div>
    </Link>
  )
}

const STEPS = [
  [Database, 'Ambil data', 'Membaca stok keluar, presensi, lembur, dan kasbon (hanya baca; data operasional tidak diubah).'],
  [Layers, 'Bandingkan model', 'Beberapa model diuji pada data yang belum dilihat (rolling-origin); yang terbaik dipilih.'],
  [LineChart, 'Hasilkan saran', 'Ramalan berinterval + titik pemesanan ulang, atau daftar penanda anomali beralasan.'],
  [UserCheck, 'Admin memutuskan', 'Penanda hanyalah saran. Keputusan admin disimpan dan dipakai menekan penanda yang keliru.'],
]

export default function RingkasanCerdas() {
  const [hub, setHub] = useState({ loading: true, data: null, error: null })
  useEffect(() => {
    let alive = true
    ringkasanHub().then((data) => alive && setHub({ loading: false, data, error: null }))
      .catch((e) => alive && setHub({ loading: false, data: null, error: e.message }))
    return () => { alive = false }
  }, [])

  const d = hub.data
  return (
    <div className="space-y-5">
      <PageHeader title="Sistem Cerdas" subtitle="Peramalan kebutuhan material dan deteksi anomali data kepegawaian berbasis machine learning" />

      <div className="grid lg:grid-cols-2 gap-5">
        <ModulCard to="/ai/peramalan" icon={PackageSearch} tone="bg-blue-50 text-blue-700" title="Peramalan Kebutuhan Material"
          desc="Meramal pemakaian material per minggu dan menyarankan kapan serta berapa banyak harus dipesan."
          points={['9–10 model dibandingkan, termasuk metode lama pada Prediksi Stok', 'Interval ketidakpastian 80% & stok pengaman', 'Titik pemesanan ulang dengan alasan yang dapat dibaca']} />
        <ModulCard to="/ai/anomali" icon={ShieldAlert} tone="bg-amber-50 text-amber-700" title="Deteksi Anomali Kepegawaian"
          desc="Menandai presensi, lembur, kasbon, dan gaji yang tidak wajar agar admin dapat memeriksanya lebih dulu."
          points={['Aturan bisnis + statistik robust + Isolation Forest', 'Skor & alasan untuk setiap penanda', 'Pusat Tinjauan: valid / bukan anomali / abaikan']} />
      </div>

      <Card title="Status">
        {hub.loading && <p className="text-sm text-gray-400">Memuat…</p>}
        {hub.error && <Notice tone="danger">{hub.error}</Notice>}
        {d && !d.tersedia && <SetupNotice />}
        {d?.tersedia && (
          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard label="Anomali menunggu tinjauan" value={d.anomaliBaru} sub={d.anomaliBaru ? 'buka Deteksi Anomali → Pusat Tinjauan' : 'tidak ada antrean'} color={d.anomaliBaru ? 'amber' : 'green'} />
            {d.rekomendasi ? (
              <div className="rounded-2xl border border-blue-100 bg-white p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rekomendasi pengadaan terakhir • {tgl(d.rekomendasi.tanggal)}</p>
                <div className="flex flex-wrap gap-3">
                  {['habis', 'kritis', 'waspada', 'aman'].map((r) => (
                    <div key={r} className="text-center"><p className="text-2xl font-extrabold text-gray-900">{d.rekomendasi[r]}</p><RiskBadge risiko={r} /></div>))}
                </div>
              </div>
            ) : <Notice tone="info">Belum ada rekomendasi pengadaan tersimpan. Jalankan dan simpan analisis pada modul Peramalan.</Notice>}
          </div>
        )}
      </Card>

      <Card title="Cara kerja">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(([Icon, t, desc], i) => (
            <div key={t} className="relative rounded-2xl bg-blue-50/50 border border-blue-100 p-4">
              <span className="absolute top-3 right-3 text-[10px] font-black text-blue-300">0{i + 1}</span>
              <Icon size={20} className="text-blue-700 mb-2" />
              <p className="font-bold text-gray-900 text-sm">{t}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Prinsip dan batasan">
        <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5 leading-relaxed">
          <li>Modul ini <b>tambahan</b>: halaman, tabel, dan alur yang sudah ada tidak diubah.</li>
          <li>Hasil adalah <b>saran</b> berbasis data historis. Ramalan mengandung ketidakpastian (lihat intervalnya) dan penanda anomali dapat keliru; keputusan akhir tetap pada admin.</li>
          <li>Data dengan riwayat pendek menghasilkan ramalan yang kurang andal. Sistem menolak menganalisis bila riwayat terlalu pendek dan menyatakannya dengan jelas.</li>
          <li>Data penanda anomali menyangkut individu karyawan: hanya admin dan HRD yang dapat melihatnya, dan penggunaannya sebaiknya mengikuti kebijakan privasi perusahaan.</li>
          <li><b>Mode demo</b> memakai data sintetis untuk peragaan; hasil evaluasinya tidak menggambarkan kinerja pada data nyata.</li>
        </ul>
      </Card>
    </div>
  )
}
