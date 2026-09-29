import { describe, it, expect } from 'vitest'
import { hitungGaji, hitungKomponenJam, hitungDurasiLembur } from '../utils/calculations'

describe('hitungGaji (preview gaji)', () => {
  const base = {
    hariHadir: 6, gajiHarian: 100000, uangMakan: 30000, uangTransport: 20000,
    totalLembur: 50000, totalKasbon: 0,
  }
  it('menghitung gaji kotor & bersih', () => {
    const r = hitungGaji(base)
    expect(r.gajiPokok).toBe(600000)
    expect(r.tunjangan).toBe(50000)
    expect(r.gajiKotor).toBe(700000)
    expect(r.gajiBersih).toBe(700000)
  })
  it('kasbon & potongan mengurangi gaji bersih', () => {
    const r = hitungGaji({ ...base, totalKasbon: 200000, potonganLainnya: 50000 })
    expect(r.totalPotongan).toBe(250000)
    expect(r.gajiBersih).toBe(450000)
  })
  it('gaji bersih tidak pernah negatif', () => {
    expect(hitungGaji({ ...base, totalKasbon: 9000000 }).gajiBersih).toBe(0)
  })
})

describe('hitungKomponenJam', () => {
  it('< 8 jam: dibayar proporsional, tanpa lembur', () => {
    const r = hitungKomponenJam(4, 160000)
    expect(r.gajiPokok).toBe(80000)
    expect(r.jamLembur).toBe(0)
  })
  it('10 jam: 1 hari + 2 jam lembur', () => {
    const r = hitungKomponenJam(10, 160000)
    expect(r.hariKerja).toBe(1)
    expect(r.jamLembur).toBe(2)
    expect(r.gajiLembur).toBe(40000)
  })
  it('input negatif / nol aman', () => {
    expect(hitungKomponenJam(-5, 100000).gajiPokok).toBe(0)
    expect(hitungKomponenJam(0, 100000).hariKerja).toBe(0)
    expect(hitungKomponenJam(8, -100).gajiPokok).toBe(0)
  })
})

describe('hitungDurasiLembur', () => {
  it('rentang biasa', () => expect(hitungDurasiLembur('17:00', '20:30')).toBe(3.5))
  it('melewati tengah malam', () => expect(hitungDurasiLembur('22:00', '02:00')).toBe(4))
})
