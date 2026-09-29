// Pembungkus pemanggilan tugas ML: memakai Web Worker bila tersedia, bila tidak berjalan langsung.
let worker = null
let seq = 0
const pending = new Map()

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./mlWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const { id, type } = e.data
    const p = pending.get(id)
    if (!p) return
    if (type === 'progress') p.onProgress?.(e.data.p, e.data.label)
    else if (type === 'done') { pending.delete(id); p.resolve(e.data.result) }
    else if (type === 'error') { pending.delete(id); p.reject(new Error(e.data.message)) }
  }
  worker.onerror = (ev) => {
    for (const [, p] of pending) p.reject(new Error(ev.message || 'Worker gagal'))
    pending.clear(); worker = null
  }
  return worker
}

/** @returns Promise hasil tugas. `onProgress(p 0..1, label)` dipanggil selama berjalan. */
export function runTask(task, payload, { onProgress } = {}) {
  if (typeof Worker === 'undefined') {
    return import('./mlTasks').then((m) => m.TASKS[task](payload, onProgress))
  }
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject, onProgress })
    ensureWorker().postMessage({ id, task, payload })
  })
}

/** Membatalkan semua tugas yang sedang berjalan (worker dihentikan & dibuat ulang saat dibutuhkan). */
export function cancelTasks() {
  if (worker) { worker.terminate(); worker = null }
  for (const [, p] of pending) p.reject(new Error('Dibatalkan'))
  pending.clear()
}
