// Antrean refresh global: menjalankan tugas satu per satu dengan jeda kecil.
// Mencegah "badai request" (puluhan query serentak) ketika tab dibuka kembali atau
// ketika banyak halaman ingin memuat ulang pada saat yang sama.

const GAP_MS = 120          // jeda antar tugas → main thread & jaringan sempat bernapas
const TASK_TIMEOUT_MS = 20_000  // tugas macet tidak boleh menahan antrean selamanya

const queue = []
let running = false

const withTimeout = (p) => Promise.race([
  Promise.resolve(p),
  new Promise((resolve) => setTimeout(resolve, TASK_TIMEOUT_MS)),
])

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const { fn } = queue.shift()
      try { await withTimeout(fn()) } catch { /* satu tugas gagal tidak boleh menghentikan yang lain */ }
      await new Promise((r) => setTimeout(r, GAP_MS))
    }
  } finally {
    running = false
  }
}

/**
 * @param {() => any} fn   tugas (boleh async)
 * @param {{key?: string}} opts  tugas dengan key sama yang masih MENUNGGU digantikan (bukan dobel)
 */
export function scheduleRefresh(fn, { key } = {}) {
  if (key) {
    const pending = queue.find((q) => q.key === key)
    if (pending) { pending.fn = fn; return }
  }
  queue.push({ fn, key })
  pump()
}

// Untuk pengujian
export const __queueLength = () => queue.length
