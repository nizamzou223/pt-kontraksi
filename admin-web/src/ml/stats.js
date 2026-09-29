// Fungsi statistik dasar — murni (tanpa dependensi), deterministik, mudah diuji.

export const sum = (a) => a.reduce((s, v) => s + v, 0)
export const mean = (a) => (a.length ? sum(a) / a.length : 0)

export function variance(a) {
  if (a.length < 2) return 0
  const m = mean(a)
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)
}
export const std = (a) => Math.sqrt(variance(a))

/** Kuantil dengan interpolasi linear (q dalam 0..1). Tidak mengubah array asli. */
export function quantile(arr, q) {
  if (!arr.length) return 0
  const a = [...arr].sort((x, y) => x - y)
  const pos = (a.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return a[lo] + (a[hi] - a[lo]) * (pos - lo)
}
export const median = (a) => quantile(a, 0.5)

/** Median Absolute Deviation. */
export function mad(a, med = median(a)) {
  return a.length ? median(a.map((v) => Math.abs(v - med))) : 0
}

/**
 * Skor-z robust (Iglewicz & Hoaglin): 0,6745·(x − median)/MAD.
 * Bila MAD = 0 (data hampir seragam) dipakai `fallbackScale` (mis. simpangan baku / 1,4826 · IQR);
 * bila itu juga 0, skornya 0 (tidak ada dasar untuk menyebut menyimpang).
 */
export function robustZ(x, med, madValue, fallbackScale = 0) {
  if (madValue > 0) return (0.6745 * (x - med)) / madValue
  if (fallbackScale > 0) return (x - med) / fallbackScale
  return 0
}

/** Generator angka acak berbenih (mulberry32) → hasil percobaan dapat diulang persis. */
export function mulberry32(seed = 42) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Sampel normal baku (Box–Muller) dari generator `rand`. */
export function gaussian(rand) {
  let u = 0, v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Area di bawah kurva ROC (Mann–Whitney U, menangani skor kembar). labels: 1 = positif. */
export function rocAuc(scores, labels) {
  const idx = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0])
  let rankSumPos = 0, nPos = 0, nNeg = 0
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) { if (idx[k][1] === 1) { rankSumPos += avgRank; nPos++ } else nNeg++ }
    i = j + 1
  }
  if (!nPos || !nNeg) return NaN
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

/** Presisi, recall, F1 untuk prediksi biner. */
export function binaryMetrics(predicted, actual) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (let i = 0; i < predicted.length; i++) {
    if (predicted[i] && actual[i]) tp++
    else if (predicted[i] && !actual[i]) fp++
    else if (!predicted[i] && actual[i]) fn++
    else tn++
  }
  const precision = tp + fp ? tp / (tp + fp) : 0
  const recall = tp + fn ? tp / (tp + fn) : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  return { tp, fp, fn, tn, precision, recall, f1 }
}
