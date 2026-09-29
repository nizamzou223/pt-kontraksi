// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { PageActiveContext, usePolling } from '../utils/pageActivity'
import { scheduleRefresh, __queueLength } from '../utils/refreshScheduler'

const setTabVisible = (visible) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => { vi.useFakeTimers(); setTabVisible(true) })
afterEach(() => { cleanup(); vi.useRealTimers() })

// Harness: satu "halaman" dengan polling
function Page({ active = true, fn, ms = 10_000, exposeRequest }) {
  const request = usePolling(fn, ms)
  if (exposeRequest) exposeRequest.current = request
  return <PageActiveContext.Provider value={active}><span>x</span></PageActiveContext.Provider>
}
// Provider harus di luar hook → bungkus
const Wrapped = ({ active, ...rest }) => (
  <PageActiveContext.Provider value={active}><Page {...rest} active={active} /></PageActiveContext.Provider>
)
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('refreshScheduler', () => {
  it('menjalankan tugas SATU PER SATU (tidak serentak)', async () => {
    let running = 0, maxRunning = 0, done = 0
    const task = () => async () => {
      running++; maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 300))
      running--; done++
    }
    for (let i = 0; i < 6; i++) scheduleRefresh(task(), { key: `k${i}` })
    await advance(10_000)
    expect(done).toBe(6)
    expect(maxRunning).toBe(1)
  })

  it('tugas dengan key sama yang masih menunggu digantikan, bukan dobel', async () => {
    const calls = []
    scheduleRefresh(async () => { await new Promise((r) => setTimeout(r, 500)); calls.push('pertama') }, { key: 'a' })
    scheduleRefresh(() => calls.push('B-lama'), { key: 'b' })
    scheduleRefresh(() => calls.push('B-baru'), { key: 'b' })   // menimpa B-lama
    await advance(5_000)
    expect(calls).toEqual(['pertama', 'B-baru'])
  })

  it('tugas yang gagal tidak menghentikan antrean', async () => {
    const calls = []
    scheduleRefresh(() => { throw new Error('boom') }, { key: 'x' })
    scheduleRefresh(() => calls.push('lanjut'), { key: 'y' })
    await advance(2_000)
    expect(calls).toEqual(['lanjut'])
  })

  it('tugas yang macet dilepas setelah timeout sehingga antrean tidak beku', async () => {
    const calls = []
    scheduleRefresh(() => new Promise(() => {}), { key: 'macet' })   // tidak pernah selesai
    scheduleRefresh(() => calls.push('setelah-macet'), { key: 'ok' })
    await advance(19_000)
    expect(calls).toEqual([])            // masih menunggu timeout 20 dtk
    await advance(3_000)
    expect(calls).toEqual(['setelah-macet'])
    expect(__queueLength()).toBe(0)
  })
})

describe('usePolling — tidak bekerja saat tab/halaman tersembunyi', () => {
  it('halaman aktif & tab terlihat: berjalan tiap interval', async () => {
    const fn = vi.fn()
    render(<Wrapped active fn={fn} ms={10_000} />)
    await advance(10_500)
    expect(fn).toHaveBeenCalledTimes(1)
    await advance(10_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('tab TERSEMBUNYI: tidak ada polling sama sekali', async () => {
    const fn = vi.fn()
    render(<Wrapped active fn={fn} ms={10_000} />)
    act(() => setTabVisible(false))
    await advance(120_000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('kembali ke tab setelah lama: refresh SEKALI (bukan menumpuk)', async () => {
    const fn = vi.fn()
    render(<Wrapped active fn={fn} ms={10_000} />)
    act(() => setTabVisible(false))
    await advance(300_000)               // 5 menit di tab lain
    expect(fn).not.toHaveBeenCalled()
    act(() => setTabVisible(true))
    await advance(2_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('kembali cepat (data belum basi): tidak refresh berlebihan', async () => {
    const fn = vi.fn()
    render(<Wrapped active fn={fn} ms={60_000} />)
    act(() => setTabVisible(false))
    await advance(5_000)
    act(() => setTabVisible(true))
    await advance(3_000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('halaman TIDAK aktif (KeepAlive tersembunyi): tidak polling; aktif lagi → refresh sekali', async () => {
    const fn = vi.fn()
    const { rerender } = render(<Wrapped active={false} fn={fn} ms={10_000} />)
    await advance(120_000)
    expect(fn).not.toHaveBeenCalled()
    rerender(<Wrapped active fn={fn} ms={10_000} />)
    await advance(2_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('request() saat tersembunyi hanya menandai; dijalankan begitu halaman aktif', async () => {
    const fn = vi.fn()
    const ref = { current: null }
    const { rerender } = render(<Wrapped active={false} fn={fn} ms={0} exposeRequest={ref} />)
    act(() => ref.current())             // event realtime datang saat halaman tersembunyi
    act(() => ref.current())
    await advance(5_000)
    expect(fn).not.toHaveBeenCalled()
    rerender(<Wrapped active fn={fn} ms={0} exposeRequest={ref} />)
    await advance(2_000)
    expect(fn).toHaveBeenCalledTimes(1)  // dua event → satu refresh
  })

  it('request() saat aktif langsung menjalankan', async () => {
    const fn = vi.fn()
    const ref = { current: null }
    render(<Wrapped active fn={fn} ms={0} exposeRequest={ref} />)
    act(() => ref.current())
    await advance(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('10 halaman kembali aktif bersamaan: refresh berjalan berurutan, bukan serentak', async () => {
    let running = 0, maxRunning = 0, total = 0
    const mk = () => vi.fn(async () => {
      running++; maxRunning = Math.max(maxRunning, running); total++
      await new Promise((r) => setTimeout(r, 200))
      running--
    })
    const fns = Array.from({ length: 10 }, mk)
    render(<>{fns.map((fn, i) => <Wrapped key={i} active fn={fn} ms={10_000} />)}</>)
    act(() => setTabVisible(false))
    await advance(200_000)
    expect(total).toBe(0)
    act(() => setTabVisible(true))
    await advance(6_000)                 // < interval 10 dtk → hanya refresh "kembali aktif"
    expect(total).toBe(10)               // semua ter-refresh…
    expect(maxRunning).toBe(1)           // …tetapi tidak pernah lebih dari satu sekaligus
  })

  it('unmount membersihkan timer (tidak bocor)', async () => {
    const fn = vi.fn()
    const { unmount } = render(<Wrapped active fn={fn} ms={10_000} />)
    unmount()
    await advance(60_000)
    expect(fn).not.toHaveBeenCalled()
  })
})
