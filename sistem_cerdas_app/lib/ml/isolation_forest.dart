// Isolation Forest (Liu, Ting & Zhou, 2008) — deteksi anomali multivariat tanpa label.
// Ide: titik anomali "mudah diisolasi" → rata-rata kedalaman pohonnya dangkal.
//   skor s(x, n) = 2^(−E[h(x)] / c(n))  →  mendekati 1 = anomali, ≈ 0,5 = normal, < 0,5 = sangat normal.
// Deterministik (benih tetap). Port dari admin-web/src/ml/isolationForest.js.
import 'dart:math' as math;

import 'stats.dart';

const _euler = 0.5772156649;

/// Rata-rata panjang lintasan pencarian tak berhasil pada BST dengan n titik.
double cFactor(int n) {
  if (n <= 1) return 0;
  if (n == 2) return 1;
  return 2 * (math.log(n - 1) + _euler) - (2.0 * (n - 1)) / n;
}

class _IsoNode {
  final int size; // >= 0 untuk daun, -1 untuk simpul dalam
  final int f;
  final double thr;
  final _IsoNode? left;
  final _IsoNode? right;
  const _IsoNode.leaf(this.size)
      : f = 0,
        thr = 0,
        left = null,
        right = null;
  const _IsoNode.split(this.f, this.thr, this.left, this.right) : size = -1;
}

_IsoNode _build(List<List<double>> x, List<int> idx, int depth, int maxDepth, Mulberry32 rand) {
  final n = idx.length;
  if (depth >= maxDepth || n <= 1) return _IsoNode.leaf(n);
  final nFeat = x[0].length;
  // urutan fitur diacak (Fisher–Yates berbenih)
  final order = List<int>.generate(nFeat, (f) => f);
  for (var i = order.length - 1; i > 0; i--) {
    final j = rand.nextInt(i + 1);
    final t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  for (final f in order) {
    var lo = double.infinity, hi = double.negativeInfinity;
    for (final i in idx) {
      final v = x[i][f];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi > lo) {
      final thr = lo + rand.next() * (hi - lo);
      final left = <int>[], right = <int>[];
      for (final i in idx) {
        (x[i][f] < thr ? left : right).add(i);
      }
      if (left.isEmpty || right.isEmpty) continue;
      return _IsoNode.split(f, thr, _build(x, left, depth + 1, maxDepth, rand), _build(x, right, depth + 1, maxDepth, rand));
    }
  }
  return _IsoNode.leaf(n);
}

double _pathLength(_IsoNode node, List<double> x) {
  var depth = 0;
  var n = node;
  while (n.size < 0) {
    n = x[n.f] < n.thr ? n.left! : n.right!;
    depth++;
  }
  return depth + cFactor(n.size);
}

class IsolationForest {
  final int nTrees;
  final int sampleSize;
  final int seed;
  final List<_IsoNode> _trees = [];
  int _psi = 0;

  IsolationForest({this.nTrees = 100, this.sampleSize = 256, this.seed = 42});

  IsolationForest fit(List<List<double>> x) {
    final rand = Mulberry32(seed);
    final n = x.length;
    _psi = math.min(sampleSize, n);
    final maxDepth = (math.log(math.max(2, _psi)) / math.ln2).ceil();
    _trees.clear();
    for (var t = 0; t < nTrees; t++) {
      // subsampel tanpa pengembalian (Fisher–Yates parsial)
      final pool = List<int>.generate(n, (i) => i);
      for (var i = 0; i < _psi; i++) {
        final j = i + (rand.next() * (n - i)).floor();
        final tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      _trees.add(_build(x, pool.sublist(0, _psi), 0, maxDepth, rand));
    }
    return this;
  }

  /// Skor anomali 0..1 untuk tiap baris.
  List<double> score(List<List<double>> x) {
    final c = cFactor(_psi);
    return [
      for (final row in x)
        () {
          var s = 0.0;
          for (final t in _trees) {
            s += _pathLength(t, row);
          }
          final avg = s / _trees.length;
          return c > 0 ? math.pow(2, -avg / c).toDouble() : 0.5;
        }()
    ];
  }
}
