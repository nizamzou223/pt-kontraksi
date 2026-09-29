// Eksperimen offline untuk tugas akhir — menghasilkan tabel yang dapat diulang (benih tetap).
//
//   npm run ml:eksperimen                       → data sintetis, 3 benih  (± 2 menit)
//   npm run ml:eksperimen -- --seeds=5          → lebih banyak benih (hasil lebih stabil)
//   npm run ml:eksperimen -- --sumber=db --project=1   → data NYATA (butuh TEST_ADMIN_EMAIL/PASSWORD di .env)
//
// Keluaran: ml-experiments/hasil/*.md dan *.csv
//
// PENTING: hasil pada data sintetis hanya memeriksa bahwa mekanismenya bekerja. Klaim ilmiah
// untuk skripsi harus bertumpu pada data nyata (--sumber=db) atau data pengujian lapangan.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateMaterialDemand } from '../src/ml/synthetic.js'
import { generateWorkforce } from '../src/ml/syntheticWorkforce.js'
import { defaultModels } from '../src/ml/forecasters.js'
import { rollingOrigin, summarize, bestModelId } from '../src/ml/evaluation.js'
import { evaluateAnomalyMethods, sweepThreshold, VARIAN } from '../src/ml/anomalyEvaluation.js'
import { mean, std } from '../src/ml/stats.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'hasil')
mkdirSync(outDir, { recursive: true })

const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : def
}
const SEEDS = Number(arg('seeds', 3))
const SUMBER = arg('sumber', 'sintetis')
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—')
const pm = (arr, d = 3) => `${f(mean(arr), d)} ± ${f(std(arr), d)}`
const pctf = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1).replace('.', ',')}%` : '—')
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
const csv = (head, rows) => [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
const stamp = new Date().toISOString()
const meta = `_Dibuat ${stamp} • Node ${process.version} • benih 1..${SEEDS} • sumber: ${SUMBER}_`

// ───────────────────────── 1. Eksperimen peramalan ─────────────────────────
async function eksperimenPeramalan() {
  console.log(`\n[1/2] Peramalan — ${SUMBER}, ${SEEDS} benih`)
  const perModel = new Map() // id → {nama, kelompok, mase[], rmse[], wape[], bias[], rank[], wins[]}
  const horizon = 4
  for (let seed = 1; seed <= SEEDS; seed++) {
    const d = generateMaterialDemand({ items: 18, weeks: 52, seed })
    const items = d.items.map((i) => ({ id: i.id, nama: i.nama, values: i.values, exog: i.exog }))
    const models = defaultModels({ withExog: true })
    const t0 = performance.now()
    const recs = rollingOrigin({ items, models, horizon, nOrigins: 6, minTrain: 24 })
    const sum = summarize(recs, models)
    console.log(`  benih ${seed}: ${((performance.now() - t0) / 1000).toFixed(1)} dtk, terbaik = ${bestModelId(sum)}`)
    for (const m of sum.models) {
      if (!perModel.has(m.id)) perModel.set(m.id, { nama: m.nama, kelompok: m.kelompok, mase: [], rmse: [], wape: [], bias: [], rank: [], wins: [] })
      const p = perModel.get(m.id)
      p.mase.push(m.mase); p.rmse.push(m.rmse); p.wape.push(m.wape); p.bias.push(m.bias); p.rank.push(m.meanRank); p.wins.push(m.wins)
    }
  }
  const rows = [...perModel.entries()].sort((a, b) => mean(a[1].mase) - mean(b[1].mase))
  const lama = perModel.get('rf_lama')
  const head = ['Model', 'Jenis', 'MASE', 'RMSE', 'WAPE', 'Bias', 'Peringkat rata-rata', 'Kemenangan/benih']
  const body = rows.map(([id, p]) => [
    p.nama + (id === 'rf_lama' ? ' *(metode lama)*' : ''), p.kelompok, pm(p.mase), pm(p.rmse, 2), pctf(mean(p.wape)), f(mean(p.bias), 2), f(mean(p.rank), 2), f(mean(p.wins), 1),
  ])
  const terbaik = rows[0]
  const md = [
    `# Eksperimen peramalan kebutuhan material`, '', meta, '',
    `Data: **sintetis** (generator berbenih), 18 barang × 52 minggu; horizon ${horizon} minggu; validasi *rolling-origin* pada 6 titik asal terakhir; nilai = rata-rata ± simpangan baku lintas ${SEEDS} benih.`, '',
    table(head, body), '',
    `**Model terbaik (MASE rata-rata):** ${terbaik[1].nama} (${f(mean(terbaik[1].mase))}).`,
    lama ? `**Perbandingan dengan metode lama** (Random Forest lag-4 pada halaman Prediksi Stok): MASE ${f(mean(lama.mase))} → ${f(mean(terbaik[1].mase))} (${pctf((mean(lama.mase) - mean(terbaik[1].mase)) / mean(lama.mase))} lebih baik).` : '', '',
    '> MASE < 1 = lebih baik daripada ramalan *naive*. WAPE = Σ|galat| ÷ Σ realisasi.',
    '> **Catatan kejujuran:** pada data sintetis ini kebutuhan sengaja dibuat bergantung pada jumlah tenaga kerja, sehingga model yang memakai fitur tenaga kerja diuntungkan. Hasil ini memeriksa mekanisme, bukan membuktikan kinerja di lapangan.',
  ].join('\n')
  writeFileSync(path.join(outDir, 'peramalan.md'), md)
  writeFileSync(path.join(outDir, 'peramalan.csv'), csv(head, body))
  console.log('  → hasil/peramalan.md, peramalan.csv')
}

// ───────────────────────── 2. Eksperimen anomali ─────────────────────────
async function eksperimenAnomali() {
  console.log(`\n[2/2] Deteksi anomali — ${SEEDS} benih × 2 tingkat kesulitan`)
  const md = [`# Eksperimen deteksi anomali data kepegawaian`, '', meta, '']
  const csvRows = []
  for (const difficulty of ['mudah', 'sulit']) {
    const agg = new Map(VARIAN.map((v) => [v.id, { nama: v.nama, auc: [], p: [], r: [], f1: [] }]))
    const sweep = new Map()
    let nAnomali = 0
    for (let seed = 21; seed < 21 + SEEDS; seed++) {
      const ds = generateWorkforce({ employees: 30, days: 60, seed, difficulty })
      nAnomali = ds.labels.size
      const ev = evaluateAnomalyMethods(ds, { threshold: 0.5 })
      for (const h of ev.hasil) { const a = agg.get(h.id); a.auc.push(h.auc); a.p.push(h.precision); a.r.push(h.recall); a.f1.push(h.f1) }
      for (const r of sweepThreshold(ds).rows) { if (!sweep.has(r.threshold)) sweep.set(r.threshold, { p: [], r: [], f1: [] }); const s = sweep.get(r.threshold); s.p.push(r.precision); s.r.push(r.recall); s.f1.push(r.f1) }
    }
    const head = ['Metode', 'ROC-AUC', 'Presisi', 'Recall', 'F1']
    const body = [...agg.values()].map((a) => [a.nama, pm(a.auc), pm(a.p), pm(a.r), pm(a.f1)])
    md.push(`## Tingkat kesulitan: ${difficulty}`, '', `≈ ${nAnomali} anomali disuntikkan per benih; ambang skor 0,5; rata-rata ± simpangan baku lintas ${SEEDS} benih.`, '', table(head, body), '',
      '**Sapuan ambang (hibrida):**', '', table(['Ambang', 'Presisi', 'Recall', 'F1'], [...sweep.entries()].map(([t, s]) => [f(t, 2), pm(s.p, 2), pm(s.r, 2), pm(s.f1, 2)])), '')
    body.forEach((r) => csvRows.push([difficulty, ...r]))
    console.log(`  ${difficulty}: hibrida F1 = ${pm(agg.get('hibrida').f1)}`)
  }
  md.push('> **Batasan:** anomali disuntikkan oleh generator yang sama dengan asumsi detektor; ini memeriksa mekanisme, bukan menggantikan evaluasi pada data nyata. Pada data nyata, gunakan status tinjauan admin sebagai label (presisi = valid ÷ ditandai).')
  writeFileSync(path.join(outDir, 'anomali.md'), md.join('\n'))
  writeFileSync(path.join(outDir, 'anomali.csv'), csv(['Kesulitan', 'Metode', 'ROC-AUC', 'Presisi', 'Recall', 'F1'], csvRows))
  console.log('  → hasil/anomali.md, anomali.csv')
}

// ───────────────────────── 3. Data nyata (opsional) ─────────────────────────
async function eksperimenDb() {
  const envPath = path.join(here, '..', '.env')
  if (existsSync(envPath)) for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2] }
  const { TEST_ADMIN_EMAIL: email, TEST_ADMIN_PASSWORD: password } = process.env
  if (!email || !password) { console.error('Mode --sumber=db membutuhkan TEST_ADMIN_EMAIL dan TEST_ADMIN_PASSWORD (akun admin/HRD) di .env'); process.exit(2) }
  const projectId = Number(arg('project', 0))
  if (!projectId) { console.error('Tentukan proyek: --project=<id>'); process.exit(2) }

  const { default: supabase } = await import('../src/services/supabaseClient.js')
  const { loadMaterialData, loadWorkforceData } = await import('../src/services/mlService.js')
  const { runForecastPipeline } = await import('../src/ml/forecastPipeline.js')
  const { detectAnomalies } = await import('../src/ml/anomalyDetector.js')

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { console.error('Login gagal:', error.message); process.exit(2) }

  console.log(`\n[DB] Peramalan proyek ${projectId}`)
  const data = await loadMaterialData(projectId, { weeks: 52 })
  const r = runForecastPipeline({ weeks: data.weeks, items: data.items, horizon: 4, nOrigins: 8, useExog: data.meta.exogTersedia })
  const lines = [`# Hasil pada DATA NYATA — proyek ${projectId}`, '', meta, '', `Transaksi stok keluar: ${data.meta.nTransaksi}; barang: ${data.items.length}; minggu: ${data.weeks.length}.`, '']
  if (!r.ok) lines.push(`**Analisis tidak dapat dijalankan:** ${r.alasan}`)
  else {
    lines.push(table(['Model', 'MASE', 'RMSE', 'WAPE', 'Bias'], r.evaluasi.map((m) => [m.nama, f(m.mase), f(m.rmse, 2), pctf(m.wape), f(m.bias, 2)])), '', `Model terbaik: **${r.modelTerbaik}**; cakupan interval 80%: ${pctf(r.cakupanInterval.picp)}.`)
  }

  console.log('[DB] Anomali (30 hari terakhir) — hanya AGREGAT, tanpa nama karyawan')
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const wf = await loadWorkforceData({ projectId, from, to })
  const a = detectAnomalies({ ...wf })
  const perKode = new Map()
  for (const it of a.items) for (const al of it.alasan) perKode.set(al.kode, (perKode.get(al.kode) || 0) + 1)
  lines.push('', '## Anomali 30 hari terakhir (agregat)', '', `Ditandai: ${a.ringkasan.ditandai} (tinggi ${a.ringkasan.perTingkat.tinggi}, sedang ${a.ringkasan.perTingkat.sedang}); diperiksa: presensi ${a.ringkasan.diperiksa.presensi}, lembur ${a.ringkasan.diperiksa.lembur}, kasbon ${a.ringkasan.diperiksa.kasbon}.`, '',
    table(['Kode alasan', 'Jumlah'], [...perKode.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v])))
  writeFileSync(path.join(outDir, `data-nyata-proyek-${projectId}.md`), lines.join('\n'))
  console.log(`  → hasil/data-nyata-proyek-${projectId}.md`)
}

if (SUMBER === 'db') await eksperimenDb()
else { await eksperimenPeramalan(); await eksperimenAnomali() }
console.log('\nSelesai.')
