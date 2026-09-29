// Isolation Forest (Liu, Ting & Zhou, 2008) — deteksi anomali multivariat tanpa label.
// Ide: titik anomali "mudah diisolasi" → rata-rata kedalaman pohon-nya dangkal.
//   skor s(x, n) = 2^(−E[h(x)] / c(n))   →  mendekati 1 = anomali, ≈ 0,5 = normal, < 0,5 = sangat normal.
// Deterministik (benih tetap) agar hasil percobaan dapat direproduksi.
import { mulberry32 } from './stats'

const EULER = 0.5772156649

/** Rata-rata panjang lintasan pencarian tak berhasil pada BST dengan n titik. */
export function cFactor(n) {
  if (n <= 1) return 0
  if (n === 2) return 1
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n
}

function buildTree(X, idx, depth, maxDepth, rand) {
  const n = idx.length
  if (depth >= maxDepth || n <= 1) return { size: n }
  const nFeat = X[0].length
  // pilih fitur yang masih bervariasi pada simpul ini
  const order = Array.from({ length: nFeat }, (_, f) => f).sort(() => rand() - 0.5)
  for (const f of order) {
    let lo = Infinity, hi = -Infinity
    for (const i of idx) { const v = X[i][f]; if (v < lo) lo = v; if (v > hi) hi = v }
    if (hi > lo) {
      const thr = lo + rand() * (hi - lo)
      const left = idx.filter((i) => X[i][f] < thr)
      const right = idx.filter((i) => X[i][f] >= thr)
      if (!left.length || !right.length) continue
      return { f, thr, left: buildTree(X, left, depth + 1, maxDepth, rand), right: buildTree(X, right, depth + 1, maxDepth, rand) }
    }
  }
  return { size: n }
}

function pathLength(node, x, depth = 0) {
  if (node.size !== undefined) return depth + cFactor(node.size)
  return pathLength(x[node.f] < node.thr ? node.left : node.right, x, depth + 1)
}

export class IsolationForest {
  constructor({ nTrees = 100, sampleSize = 256, seed = 42 } = {}) {
    Object.assign(this, { nTrees, sampleSize, seed })
    this.trees = []
    this.psi = 0
  }

  fit(X) {
    const rand = mulberry32(this.seed)
    const n = X.length
    this.psi = Math.min(this.sampleSize, n)
    const maxDepth = Math.ceil(Math.log2(Math.max(2, this.psi)))
    this.trees = []
    for (let t = 0; t < this.nTrees; t++) {
      // subsampel tanpa pengembalian (Fisher–Yates parsial)
      const pool = Array.from({ length: n }, (_, i) => i)
      for (let i = 0; i < this.psi; i++) { const j = i + Math.floor(rand() * (n - i)); [pool[i], pool[j]] = [pool[j], pool[i]] }
      this.trees.push(buildTree(X, pool.slice(0, this.psi), 0, maxDepth, rand))
    }
    return this
  }

  /** Skor anomali 0..1 untuk tiap baris. */
  score(X) {
    const c = cFactor(this.psi)
    return X.map((x) => {
      const avg = this.trees.reduce((s, tr) => s + pathLength(tr, x), 0) / this.trees.length
      return c > 0 ? 2 ** (-avg / c) : 0.5
    })
  }
}
