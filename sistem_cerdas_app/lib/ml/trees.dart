// Pohon regresi, Random Forest, dan Gradient Boosting (kuadrat terkecil) tanpa dependensi.
// Deterministik: seluruh keacakan memakai generator berbenih. Port dari admin-web/src/ml/gbm.js.
import 'stats.dart';

class _Node {
  final bool leaf;
  final double value;
  final int f;
  final double thr;
  final _Node? left;
  final _Node? right;
  const _Node.leaf(this.value)
      : leaf = true,
        f = 0,
        thr = 0,
        left = null,
        right = null;
  const _Node.split(this.f, this.thr, this.left, this.right)
      : leaf = false,
        value = 0;
}

class _Opts {
  final int maxDepth;
  final int minLeaf;
  final int? maxFeatures;
  final Mulberry32? rand;
  const _Opts(this.maxDepth, this.minLeaf, {this.maxFeatures, this.rand});
}

_Node _buildTree(List<List<double>> x, List<double> y, List<int> idx, int depth, _Opts o) {
  final n = idx.length;
  var total = 0.0;
  for (final i in idx) {
    total += y[i];
  }
  final value = total / n;
  if (depth >= o.maxDepth || n < 2 * o.minLeaf) return _Node.leaf(value);

  final nFeat = x[0].length;
  var feats = List<int>.generate(nFeat, (f) => f);
  final mf = o.maxFeatures;
  if (mf != null && mf < nFeat) {
    final rand = o.rand!;
    for (var i = feats.length - 1; i > 0; i--) {
      final j = (rand.next() * (i + 1)).floor();
      final t = feats[i];
      feats[i] = feats[j];
      feats[j] = t;
    }
    feats = feats.sublist(0, mf);
  }

  double bestGain = double.negativeInfinity;
  int bestF = -1;
  double bestThr = 0;
  var found = false;
  for (final f in feats) {
    final sorted = [...idx];
    sortStabil(sorted, (a, b) => cmpNum(x[a][f], x[b][f]));
    var sumL = 0.0;
    for (var k = 0; k < n - 1; k++) {
      sumL += y[sorted[k]];
      final nl = k + 1, nr = n - nl;
      if (x[sorted[k]][f] == x[sorted[k + 1]][f] || nl < o.minLeaf || nr < o.minLeaf) continue;
      final sumR = total - sumL;
      final gain = (sumL * sumL) / nl + (sumR * sumR) / nr - (total * total) / n;
      if (!found || gain > bestGain) {
        found = true;
        bestGain = gain;
        bestF = f;
        bestThr = (x[sorted[k]][f] + x[sorted[k + 1]][f]) / 2;
      }
    }
  }
  if (!found || bestGain <= 1e-12) return _Node.leaf(value);

  final left = <int>[], right = <int>[];
  for (final i in idx) {
    (x[i][bestF] <= bestThr ? left : right).add(i);
  }
  return _Node.split(bestF, bestThr, _buildTree(x, y, left, depth + 1, o), _buildTree(x, y, right, depth + 1, o));
}

double _predictTree(_Node node, List<double> x) {
  var n = node;
  while (!n.leaf) {
    n = x[n.f] <= n.thr ? n.left! : n.right!;
  }
  return n.value;
}

class GradientBoosting {
  final int nEstimators;
  final double learningRate;
  final int maxDepth;
  final int minLeaf;
  final double subsample;
  final int seed;
  final List<_Node> _trees = [];
  double _base = 0;

  GradientBoosting({
    this.nEstimators = 80,
    this.learningRate = 0.1,
    this.maxDepth = 3,
    this.minLeaf = 4,
    this.subsample = 0.8,
    this.seed = 42,
  });

  GradientBoosting fit(List<List<double>> x, List<double> y) {
    final rand = Mulberry32(seed);
    _base = mean(y);
    _trees.clear();
    final pred = List<double>.filled(y.length, _base);
    for (var m = 0; m < nEstimators; m++) {
      final residual = [for (var i = 0; i < y.length; i++) y[i] - pred[i]];
      final idx = <int>[];
      for (var i = 0; i < y.length; i++) {
        if (subsample >= 1 || rand.next() < subsample) idx.add(i);
      }
      if (idx.length < 2 * minLeaf) break;
      final tree = _buildTree(x, residual, idx, 0, _Opts(maxDepth, minLeaf));
      _trees.add(tree);
      for (var i = 0; i < y.length; i++) {
        pred[i] += learningRate * _predictTree(tree, x[i]);
      }
    }
    return this;
  }

  double predictOne(List<double> x) {
    var p = _base;
    for (final t in _trees) {
      p += learningRate * _predictTree(t, x);
    }
    return p;
  }
}

/// Random Forest regresi: bagging pohon dalam + subsampling fitur per simpul.
class RandomForest {
  final int nEstimators;
  final int maxDepth;
  final int minLeaf;
  final double maxFeatures;
  final int seed;
  final List<_Node> _trees = [];

  RandomForest({this.nEstimators = 60, this.maxDepth = 8, this.minLeaf = 3, this.maxFeatures = 0.8, this.seed = 42});

  RandomForest fit(List<List<double>> x, List<double> y) {
    final rand = Mulberry32(seed);
    final n = y.length;
    final mf = (maxFeatures * x[0].length).round().clamp(1, x[0].length);
    _trees.clear();
    for (var m = 0; m < nEstimators; m++) {
      final idx = List<int>.generate(n, (_) => (rand.next() * n).floor());
      _trees.add(_buildTree(x, y, idx, 0, _Opts(maxDepth, minLeaf, maxFeatures: mf, rand: rand)));
    }
    return this;
  }

  double predictOne(List<double> x) {
    var s = 0.0;
    for (final t in _trees) {
      s += _predictTree(t, x);
    }
    return s / _trees.length;
  }
}
