/**
 * Minimal K-Means (Lloyd's algorithm) with k-means++ seeding and multi-restart.
 *
 * No ML library needed for this scale (tens to low thousands of points) --
 * a plain implementation is easier to explain in a product/analytics review
 * than pulling in a dependency for it, and it is fast enough to run on demand
 * rather than as a scheduled job.
 *
 * What this file provides beyond a bare Lloyd loop:
 *   - k-means++ seeding                (spreads the initial centroids out)
 *   - multiple random restarts         (keeps the best run by inertia --
 *                                       Lloyd's only finds a *local* optimum)
 *   - silhouette score                 (how well-separated the clusters are)
 *   - chooseK                          (elbow + silhouette, so k is not just
 *                                       a magic number someone picked)
 *   - standardize / logScale helpers   (so a feature in the thousands does
 *                                       not swamp one on a 1-5 scale, and a
 *                                       few big spenders do not flatten
 *                                       everyone else into one bucket)
 */

export interface KMeansResult {
  /** Cluster index (0..k-1) assigned to each input point, same order as input. */
  assignments: number[];
  /** Final centroid coordinates, one per cluster. */
  centroids: number[][];
  /** Sum of squared distances from each point to its centroid -- lower is tighter. */
  inertia: number;
  iterations: number;
  /** Mean silhouette over all points, in [-1, 1]. Higher = better separated. */
  silhouette: number;
}

function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * k-means++ initialisation: pick the first centroid uniformly at random, then
 * each subsequent centroid with probability proportional to its squared
 * distance from the nearest existing centroid. This spreads the starting
 * centroids out and converges far more reliably than picking k random points.
 */
function seedCentroids(points: number[][], k: number, random: () => number): number[][] {
  const centroids: number[][] = [points[Math.floor(random() * points.length)]];

  while (centroids.length < k) {
    const distances = points.map((p) => Math.min(...centroids.map((c) => squaredDistance(p, c))));
    const total = distances.reduce((sum, d) => sum + d, 0);

    if (total === 0) {
      // All remaining points coincide with an existing centroid -- fall back
      // to a uniform pick so we don't spin forever.
      centroids.push(points[Math.floor(random() * points.length)]);
      continue;
    }

    let target = random() * total;
    let chosen = points[points.length - 1];
    for (let i = 0; i < points.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        chosen = points[i];
        break;
      }
    }
    centroids.push(chosen);
  }

  return centroids;
}

/** One Lloyd's run from a given seed. Internal -- callers use `kmeans`. */
function lloyd(points: number[][], k: number, maxIterations: number, random: () => number) {
  const n = points.length;
  const dims = points[0].length;

  let centroids = seedCentroids(points, k, random);
  const assignments = new Array<number>(n).fill(-1);
  let iterations = 0;

  for (; iterations < maxIterations; iterations++) {
    let changed = false;

    // --- assignment step ---
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dist = squaredDistance(points[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }

    if (!changed && iterations > 0) break;

    // --- update step ---
    const sums = Array.from({ length: k }, () => new Array(dims).fill(0));
    const counts = new Array(k).fill(0);

    for (let i = 0; i < n; i++) {
      const cluster = assignments[i];
      counts[cluster]++;
      for (let d = 0; d < dims; d++) sums[cluster][d] += points[i][d];
    }

    centroids = centroids.map((old, c) => (counts[c] === 0 ? old : sums[c].map((sum) => sum / counts[c])));
  }

  const inertia = points.reduce((sum, p, i) => sum + squaredDistance(p, centroids[assignments[i]]), 0);
  return { assignments: [...assignments], centroids, inertia, iterations };
}

/**
 * Runs K-Means to convergence (or maxIterations), repeated `restarts` times
 * with different seeds, keeping the run with the lowest inertia. `points` must
 * already be feature-scaled by the caller (see `standardize`) -- an unscaled
 * "monetary" column in the thousands would otherwise swamp a 0-5 "recency
 * score" column and the clustering would just be monetary buckets.
 */
export function kmeans(
  points: number[][],
  k: number,
  opts: { maxIterations?: number; seed?: number; restarts?: number } = {},
): KMeansResult {
  const maxIterations = opts.maxIterations ?? 100;
  const restarts = Math.max(1, opts.restarts ?? 10);
  const n = points.length;
  const dims = points[0]?.length ?? 0;

  if (n === 0 || dims === 0) return { assignments: [], centroids: [], inertia: 0, iterations: 0, silhouette: 0 };
  if (k >= n) {
    // More clusters than points -- every point is its own cluster.
    return {
      assignments: points.map((_, i) => i),
      centroids: points.map((p) => [...p]),
      inertia: 0,
      iterations: 0,
      silhouette: 0,
    };
  }

  // A seeded LCG keeps clustering deterministic across runs when a seed is
  // supplied (useful for reproducible demo data / tests) without pulling in a
  // PRNG dependency. Each restart advances the same stream, so the restarts
  // genuinely differ.
  let state = opts.seed ?? 42;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };

  let best = lloyd(points, k, maxIterations, random);
  for (let r = 1; r < restarts; r++) {
    const candidate = lloyd(points, k, maxIterations, random);
    if (candidate.inertia < best.inertia) best = candidate;
  }

  return { ...best, silhouette: silhouetteScore(points, best.assignments, k) };
}

/**
 * Mean silhouette coefficient. For each point: a = mean distance to its own
 * cluster, b = mean distance to the nearest *other* cluster; silhouette =
 * (b - a) / max(a, b). +1 = deep inside a well-separated cluster, 0 = on a
 * boundary, negative = probably in the wrong cluster. The mean over all
 * points is a single "how real are these clusters" number.
 */
export function silhouetteScore(points: number[][], assignments: number[], k: number): number {
  const n = points.length;
  if (n === 0 || k < 2) return 0;

  const members: number[][] = Array.from({ length: k }, () => []);
  assignments.forEach((c, i) => members[c].push(i));

  let total = 0;
  let counted = 0;

  for (let i = 0; i < n; i++) {
    const own = members[assignments[i]];
    if (own.length <= 1) continue; // a singleton cluster has silhouette 0

    const meanDist = (idxs: number[]) => {
      let sum = 0;
      let cnt = 0;
      for (const j of idxs) {
        if (j === i) continue;
        sum += Math.sqrt(squaredDistance(points[i], points[j]));
        cnt += 1;
      }
      return cnt ? sum / cnt : 0;
    };

    const a = meanDist(own);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === assignments[i] || members[c].length === 0) continue;
      b = Math.min(b, meanDist(members[c]));
    }
    if (!isFinite(b)) continue;

    total += (b - a) / Math.max(a, b || 1);
    counted += 1;
  }

  return counted ? total / counted : 0;
}

/**
 * Picks k over a range by combining the two standard heuristics:
 *   - silhouette  -- pick the k with the highest mean silhouette
 *   - elbow       -- the inertia curve is returned so a human (or the caller)
 *                    can see where adding clusters stops helping
 * Returns the chosen k, the silhouette that won it, and the full per-k table.
 */
export function chooseK(
  points: number[][],
  range: { min?: number; max?: number; seed?: number; restarts?: number } = {},
): { k: number; silhouette: number; candidates: { k: number; inertia: number; silhouette: number }[] } {
  const min = Math.max(2, range.min ?? 2);
  const max = Math.min(range.max ?? 6, points.length - 1);
  const candidates: { k: number; inertia: number; silhouette: number }[] = [];

  for (let k = min; k <= max; k++) {
    const result = kmeans(points, k, { seed: range.seed ?? 7, restarts: range.restarts ?? 10 });
    candidates.push({ k, inertia: result.inertia, silhouette: result.silhouette });
  }

  if (candidates.length === 0) return { k: Math.min(2, points.length), silhouette: 0, candidates };

  // Prefer the highest silhouette, but when two k values are within EPS of each
  // other treat them as tied and keep the smaller k -- a simpler segmentation
  // is more useful to a human than one extra cluster that barely separates.
  const EPS = 0.02;
  const best = Math.max(...candidates.map((c) => c.silhouette));
  const winner = candidates.find((c) => c.silhouette >= best - EPS)!;
  return { k: winner.k, silhouette: winner.silhouette, candidates };
}

/** Min-max scales each feature (column) to [0, 1] independently. */
export function minMaxScale(points: number[][]): number[][] {
  if (points.length === 0) return [];
  const dims = points[0].length;
  const mins = new Array(dims).fill(Infinity);
  const maxs = new Array(dims).fill(-Infinity);

  for (const point of points) {
    for (let d = 0; d < dims; d++) {
      if (point[d] < mins[d]) mins[d] = point[d];
      if (point[d] > maxs[d]) maxs[d] = point[d];
    }
  }

  return points.map((point) =>
    point.map((value, d) => {
      const range = maxs[d] - mins[d];
      return range === 0 ? 0 : (value - mins[d]) / range;
    }),
  );
}

/**
 * Standardises each feature to mean 0, standard deviation 1 (z-score). This is
 * the right scaler for k-means on RFM data: unlike min-max, a single outlier
 * (one customer who spent 100x the rest) does not compress everyone else into
 * a tiny corner of the [0,1] box, so the clusters reflect the bulk of the
 * customer base rather than the presence of one whale.
 */
export function standardize(points: number[][]): number[][] {
  if (points.length === 0) return [];
  const dims = points[0].length;
  const means = new Array(dims).fill(0);
  const stds = new Array(dims).fill(0);

  for (const point of points) for (let d = 0; d < dims; d++) means[d] += point[d];
  for (let d = 0; d < dims; d++) means[d] /= points.length;

  for (const point of points) for (let d = 0; d < dims; d++) stds[d] += (point[d] - means[d]) ** 2;
  for (let d = 0; d < dims; d++) stds[d] = Math.sqrt(stds[d] / points.length) || 1;

  return points.map((point) => point.map((value, d) => (value - means[d]) / stds[d]));
}

/**
 * Natural log of (1 + x), applied per selected column. RFM frequency and
 * monetary are heavily right-skewed (most customers cluster low, a few are
 * huge); a log transform pulls that tail in so the subsequent standardize +
 * k-means see the real structure instead of "big spender vs everyone else".
 */
export function logScale(points: number[][], columns?: number[]): number[][] {
  return points.map((point) =>
    point.map((value, d) => (!columns || columns.includes(d) ? Math.log1p(Math.max(0, value)) : value)),
  );
}
