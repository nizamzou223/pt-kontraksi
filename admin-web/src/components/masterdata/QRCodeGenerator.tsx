import React, { useEffect, useState, useCallback } from 'react'
import { QrCode, Download, Search, Printer, Lock, ShieldCheck, CheckCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '../../services/supabaseClient'
import { escapeHtml } from '../../utils/security'
import { useNotification } from '../../context/NotificationContext'

interface KaryawanQR {
  id: number
  nama_karyawan: string
  nik: string
  id_karyawan: string
  jabatan: { nama_jabatan: string } | null
  departemen?: { nama_departemen: string } | null
  qr?: { qr_code_value: string; scan_count: number; generated_at: string } | null
}

const QRCodeGenerator: React.FC = () => {
  const [list, setList]               = useState<KaryawanQR[]>([])
  const [filtered, setFiltered]       = useState<KaryawanQR[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<KaryawanQR | null>(null)
  const [generating, setGenerating]   = useState(false)
  const [qrImages, setQrImages]       = useState<Record<number, string>>({})
  const { success, error }            = useNotification()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('karyawan')
      .select(`id, nama_karyawan, nik, id_karyawan,
        jabatan(nama_jabatan), departemen(nama_departemen),
        karyawan_qr_code(qr_code_value, scan_count, generated_at)`)
      .eq('status_aktif', true)
      .order('nama_karyawan')

    // Dedup by id
    const seen = new Set<number>()
    const mapped = (data ?? [])
      .map(k => ({
        ...k,
        jabatan:    Array.isArray(k.jabatan)    ? k.jabatan[0]    : k.jabatan,
        departemen: Array.isArray(k.departemen) ? k.departemen[0] : k.departemen,
        qr:         Array.isArray(k.karyawan_qr_code)
                      ? (k.karyawan_qr_code[0] ?? null)
                      : null,
      }))
      .filter(k => { if (seen.has(k.id)) return false; seen.add(k.id); return true }) as KaryawanQR[]

    setList(mapped)
    setFiltered(mapped)

    // Pre-render QR images
    const imgs: Record<number, string> = {}
    for (const k of mapped) {
      if (k.qr?.qr_code_value) {
        try { imgs[k.id] = await QRCode.toDataURL(k.qr.qr_code_value, { width: 300, margin: 1 }) }
        catch { /* ignore */ }
      }
    }
    setQrImages(imgs)

    // Refresh selected state
    setSelected(prev => prev ? (mapped.find(k => k.id === prev.id) ?? null) : null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(list.filter(k =>
      k.nama_karyawan.toLowerCase().includes(q) ||
      (k.nik || '').toLowerCase().includes(q) ||
      (k.id_karyawan || '').toLowerCase().includes(q)
    ))
  }, [search, list])

  const generateQR = async () => {
    if (!selected) return
    // Guard: sudah punya QR — tidak bisa generate ulang
    if (selected.qr?.qr_code_value) {
      error('QR Code sudah aktif dan tidak dapat diubah')
      return
    }
    setGenerating(true)
    const idKaryawan = selected.id_karyawan || selected.nik
    // Nilai deterministik — tidak pakai timestamp agar stabil
    const qrValue = `KPELUS-${idKaryawan}-${selected.id}`
    const { error: err } = await supabase
      .from('karyawan_qr_code')
      .insert({ karyawan_id: selected.id, qr_code_value: qrValue })

    if (err) {
      error('Gagal membuat QR Code')
      setGenerating(false)
      return
    }
    const img = await QRCode.toDataURL(qrValue, { width: 300, margin: 1 })
    setQrImages(p => ({ ...p, [selected.id]: img }))
    success('QR Code berhasil dibuat — permanen, tidak dapat diubah')
    await fetchData()
    setGenerating(false)
  }

  const downloadQR = () => {
    if (!selected || !qrImages[selected.id]) return
    const link = document.createElement('a')
    link.href = qrImages[selected.id]
    link.download = `QR_${selected.nik || selected.id_karyawan}_${selected.nama_karyawan}.png`
    link.click()
  }

  const doPrint = () => {
    if (!selected || !qrImages[selected.id]) return
    const qrSrc   = qrImages[selected.id]
    const initials = escapeHtml(selected.nama_karyawan.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase())
    const win = window.open('', '_blank', 'width=900,height=600')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Kartu Karyawan - ${escapeHtml(selected.nama_karyawan)}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
        .card{width:85.6mm;height:54mm;background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#1d4ed8 100%);border-radius:8px;overflow:hidden;position:relative;display:flex;box-shadow:0 8px 32px rgba(0,0,0,0.25);color:white}
        .card-left{flex:1;padding:8mm 5mm 8mm 6mm;display:flex;flex-direction:column;justify-content:space-between}
        .co{font-size:7pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:.9}
        .co-sub{font-size:5pt;opacity:.7;margin-top:1px}
        .avatar{width:26px;height:26px;background:rgba(255,255,255,.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;margin-bottom:4px}
        .emp{font-size:8.5pt;font-weight:700;line-height:1.2}
        .jab{font-size:6.5pt;opacity:.85;margin-top:1px}
        .idbadge{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:3px;padding:2px 5px;font-size:5.5pt;font-weight:600}
        .card-right{width:27mm;background:rgba(255,255,255,.08);border-left:1px solid rgba(255,255,255,.15);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5mm 4mm;gap:4px}
        .qrwrap{background:white;border-radius:4px;padding:3px}
        .qrwrap img{width:55px;height:55px;display:block}
        .scan{font-size:5pt;opacity:.7;text-align:center;letter-spacing:.5px}
        @media print{body{background:white;padding:5mm}.card{box-shadow:none}.no-print{display:none}}
      </style></head><body>
      <div>
        <div class="card">
          <div style="position:absolute;top:-10mm;right:18mm;width:30mm;height:30mm;border-radius:50%;background:rgba(255,255,255,.05)"></div>
          <div class="card-left">
            <div><div class="co">PT Krakatau Indah</div><div class="co-sub">Admin System · Kartu Karyawan</div></div>
            <div>
              <div class="avatar">${initials}</div>
              <div class="emp">${escapeHtml(selected.nama_karyawan)}</div>
              <div class="jab">${escapeHtml(selected.jabatan?.nama_jabatan || '-')}</div>
              ${selected.departemen?.nama_departemen ? `<div style="font-size:5.5pt;opacity:.7">${escapeHtml(selected.departemen.nama_departemen)}</div>` : ''}
            </div>
            <div><div class="idbadge">ID: ${escapeHtml(selected.nik || selected.id_karyawan)}</div></div>
          </div>
          <div class="card-right">
            <div class="qrwrap"><img src="${qrSrc}" /></div>
            <div class="scan">SCAN PRESENSI</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:16px" class="no-print">
          <button onclick="window.print();window.close()" style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600">🖨️ Cetak Kartu</button>
        </div>
      </div></body></html>`)
    win.document.close()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">QR Code Karyawan</h2>
          <p className="page-subtitle">Generate dan cetak kartu presensi QR Code</p>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── Kiri: daftar karyawan ───────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari karyawan..."
              className="form-input pl-9 w-full bg-white"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {filtered.map(k => {
              const isSelected = selected?.id === k.id
              const hasQR      = !!k.qr?.qr_code_value
              return (
                <button
                  key={k.id}
                  onClick={() => setSelected(k)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-700">
                      {k.nama_karyawan.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{k.nama_karyawan}</p>
                    <p className="text-xs text-gray-400">{k.nik || k.id_karyawan} · {k.jabatan?.nama_jabatan ?? '-'}</p>
                  </div>
                  {hasQR
                    ? <ShieldCheck size={14} className="text-green-500 flex-shrink-0" />
                    : <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                  }
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Kanan: preview & aksi ───────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">
          {selected ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
                <p className="font-bold text-gray-800">{selected.nama_karyawan}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.nik || selected.id_karyawan} · {selected.jabatan?.nama_jabatan ?? '-'}
                </p>
              </div>

              {/* QR Preview */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col items-center gap-3">
                {qrImages[selected.id] ? (
                  <>
                    {/* Kartu preview */}
                    <div
                      className="w-full rounded-xl overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#1d4ed8 100%)',
                        aspectRatio: '85.6/54',
                        display: 'flex',
                        color: 'white',
                        position: 'relative',
                      }}
                    >
                      <div style={{ position:'absolute', top:'-20%', right:'25%', width:'50%', height:'120%', borderRadius:'50%', background:'rgba(255,255,255,.05)' }} />
                      <div style={{ flex:1, padding:'12px 8px 12px 14px', display:'flex', flexDirection:'column', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                        <div>
                          <div style={{ fontSize:7, fontWeight:700, letterSpacing:1, textTransform:'uppercase', opacity:.9 }}>PT Krakatau Indah</div>
                          <div style={{ fontSize:5, opacity:.7 }}>Admin System · Kartu Karyawan</div>
                        </div>
                        <div>
                          <div style={{ width:24, height:24, background:'rgba(255,255,255,.25)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, marginBottom:4 }}>
                            {selected.nama_karyawan.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ fontSize:8, fontWeight:700, lineHeight:1.3 }}>{selected.nama_karyawan}</div>
                          <div style={{ fontSize:6, opacity:.85, marginTop:1 }}>{selected.jabatan?.nama_jabatan || '-'}</div>
                        </div>
                        <div style={{ background:'rgba(255,255,255,.2)', border:'1px solid rgba(255,255,255,.3)', borderRadius:3, padding:'1px 4px', fontSize:5, fontWeight:600, display:'inline-block' }}>
                          ID: {selected.nik || selected.id_karyawan}
                        </div>
                      </div>
                      <div style={{ width:76, background:'rgba(255,255,255,.08)', borderLeft:'1px solid rgba(255,255,255,.15)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px', gap:3, position:'relative', zIndex:1 }}>
                        <div style={{ background:'white', borderRadius:3, padding:2 }}>
                          <img src={qrImages[selected.id]} alt="QR" style={{ width:52, height:52, display:'block' }} />
                        </div>
                        <div style={{ fontSize:4.5, opacity:.7, textAlign:'center' }}>SCAN PRESENSI</div>
                      </div>
                    </div>

                    {/* QR value preview */}
                    <p className="text-xs text-gray-400 font-mono">
                      {selected.qr?.qr_code_value?.slice(0, 18)}…
                    </p>
                    {selected.qr?.scan_count !== undefined && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <CheckCircle size={12} className="text-green-500" />
                        Dipindai: {selected.qr.scan_count}x
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <QrCode size={48} className="text-gray-200" />
                    <p className="text-sm text-gray-400">Belum ada QR Code</p>
                    <p className="text-xs text-gray-300 text-center">Klik Generate untuk membuat QR permanen</p>
                  </div>
                )}
              </div>

              {/* Tombol aksi */}
              {selected.qr?.qr_code_value ? (
                // Sudah punya QR — TERKUNCI, tidak bisa generate ulang
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold">
                    <Lock size={14} />
                    QR Aktif — Tidak Dapat Diubah
                  </div>
                  <button onClick={downloadQR}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                    <Download size={15} />
                    Download PNG
                  </button>
                  <button onClick={doPrint}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
                    <Printer size={15} />
                    Cetak Kartu ID
                  </button>
                </div>
              ) : (
                // Belum punya QR — tampilkan Generate
                <button
                  onClick={generateQR}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition-colors"
                >
                  {generating
                    ? <><span className="loading-spinner w-4 h-4" /> Membuat QR…</>
                    : <><QrCode size={16} /> Generate QR Code</>
                  }
                </button>
              )}
            </>
          ) : (
            // Belum pilih karyawan
            <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-3 py-16 text-gray-300">
              <QrCode size={40} />
              <p className="text-sm font-medium text-gray-400">Pilih karyawan</p>
              <p className="text-xs text-center text-gray-300 px-4">Klik nama karyawan di sebelah kiri untuk melihat QR Code</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QRCodeGenerator