// Web Worker: menjalankan tugas ML di luar main thread (UI tetap responsif saat pelatihan/evaluasi).
import { TASKS } from './mlTasks'

self.onmessage = async (e) => {
  const { id, task, payload } = e.data
  try {
    const fn = TASKS[task]
    if (!fn) throw new Error(`Tugas tidak dikenal: ${task}`)
    const result = await fn(payload, (p, label) => self.postMessage({ id, type: 'progress', p, label }))
    self.postMessage({ id, type: 'done', result })
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) })
  }
}
