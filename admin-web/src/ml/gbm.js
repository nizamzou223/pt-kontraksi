// Pohon regresi, Random Forest, dan Gradient Boosting (kuadrat terkecil) — ditulis sendiri tanpa
// dependensi karena XGBoost/LightGBM tidak tersedia di peramban, dan pustaka Random Forest yang ada
// tidak skalabel pada data gabungan (125 dtk untuk 30 barang vs < 1 dtk di sini).
// Deterministik: seluruh keacakan (bootstrap, subsampling fitur) memakai generator berbenih.
import { mean, mulberry32 } from './stats'

function buildTree(X, y, idx, depth, opts) {
  const { maxDepth, minLeaf, maxFeatures, rand } = opts
  const n = idx.length
  const value = idx.reduce((s, i) => s + y[i], 0) / n
  if (depth >= maxDepth || n < 2 * minLeaf) return { leaf: true, value }

  const nFeat = X[0].length
  // Random Forest: setiap simpul hanya mempertimbangkan sebagian fitur (dipilih acak)
  let feats = Array.from({ length: nFeat }, (_, f) => f)
  if (maxFeatures && maxFeatures < nFeat) {
    for (let i = feats.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [feats[i], feats[j]] = [feats[j], feats[i]] }
    feats = feats.slice(0, maxFeatures)
  }
  let best = null
  const total = idx.reduce((s, i) => s + y[i], 0)
  for (const f of feats) {
    const sorted = [...idx].sort((a, b) => X[a][f] - X[b][f])
    let sumL = 0
    for (let k = 0; k < n - 1; k++) {
      sumL += y[sorted[k]]
      const nl = k + 1, nr = n - nl
      // hanya pisahkan di antara nilai yang berbeda & memenuhi ukuran daun minimum
      if (X[sorted[k]][f] === X[sorted[k + 1]][f] || nl < minLeaf || nr < minLeaf) continue
      const sumR = total - sumL
      const gain = (sumL * sumL) / nl + (sumR * sumR) / nr - (total * total) / n // ∝ penurunan SSE
      if (!best || gain > best.gain) best = { gain, f, thr: (X[sorted[k]][f] + X[sorted[k + 1]][f]) / 2 }
    }
  }
  if (!best || best.gain <= 1e-12) return { leaf: true, value }

  const left = idx.filter((i) => X[i][best.f] <= best.thr)
  const right = idx.filter((i) => X[i][best.f] > best.thr)
  return {
    leaf: false, f: best.f, thr: best.thr,
    left: buildTree(X, y, left, depth + 1, opts),
    right: buildTree(X, y, right, depth + 1, opts),
  }
}

const predictTree = (node, x) => {
  while (!node.leaf) node = x[node.f] <= node.thr ? node.left : node.right
  return node.value
}

export class GradientBoosting {
  constructor({ nEstimators = 80, learningRate = 0.1, maxDepth = 3, minLeaf = 4, subsample = 0.8, seed = 42 } = {}) {
    Object.assign(this, { nEstimators, learningRate, maxDepth, minLeaf, subsample, seed })
    this.trees = []
    this.base = 0
  }

  fit(X, y) {
    const rand = mulberry32(this.seed)
    this.base = mean(y)
    this.trees = []
    const pred = new Array(y.length).fill(this.base)
    for (let m = 0; m < this.nEstimators; m++) {
      const residual = y.map((v, i) => v - pred[i])
      const all = Array.from({ length: y.length }, (_, i) => i)
      const idx = this.subsample < 1 ? all.filter(() => rand() < this.subsample) : all
      if (idx.length < 2 * this.minLeaf) break
      const tree = buildTree(X, residual, idx, 0, { maxDepth: this.maxDepth, minLeaf: this.minLeaf })
      this.trees.push(tree)
      for (let i = 0; i < y.length; i++) pred[i] += this.learningRate * predictTree(tree, X[i])
    }
    return this
  }

  predictOne(x) {
    let p = this.base
    for (const t of this.trees) p += this.learningRate * predictTree(t, x)
    return p
  }

  predict(rows) { return rows.map((x) => this.predictOne(x)) }
}

/** Random Forest regresi: bagging pohon dalam + subsampling fitur per simpul. */
export class RandomForest {
  constructor({ nEstimators = 60, maxDepth = 8, minLeaf = 3, maxFeatures = 0.8, seed = 42 } = {}) {
    Object.assign(this, { nEstimators, maxDepth, minLeaf, maxFeatures, seed })
    this.trees = []
  }

  fit(X, y) {
    const rand = mulberry32(this.seed)
    const n = y.length
    const mf = Math.max(1, Math.round(this.maxFeatures * X[0].length))
    this.trees = []
    for (let m = 0; m < this.nEstimators; m++) {
      const idx = Array.from({ length: n }, () => Math.floor(rand() * n)) // bootstrap (dengan pengembalian)
      this.trees.push(buildTree(X, y, idx, 0, { maxDepth: this.maxDepth, minLeaf: this.minLeaf, maxFeatures: mf, rand }))
    }
    return this
  }

  predictOne(x) {
    let s = 0
    for (const t of this.trees) s += predictTree(t, x)
    return s / this.trees.length
  }

  predict(rows) { return rows.map((x) => this.predictOne(x)) }
}
