/**
 * Minimal K-Means (Lloyd's algorithm) with k-means++ seeding.
 *
 * No ML library needed for this scale (tens to low thousands of points) --
 * a plain implementation is easier to explain in a product/analytics review
 * than pulling in a dependency for it, and it is fast enough to run on demand
 * rather than as a scheduled job.
 */

export interface KMeansResult {
  /** Cluster index (0..k-1) assigned to each input point, same order as input. */
  assignments: number[];
  /** Final centroid coordinates, one per cluster. */
  centroids: number[][];
  /** Sum of squared distances from each point to its centroid -- lower is tighter. */
  inertia: number;
  iterations: number;
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

/**
 * Runs K-Means to convergence (or maxIterations). `points` must already be
 * feature-scaled by the caller -- an unscaled "monetary" column in the
 * thousands would otherwise swamp a 0-5 "recency score" column and the
 * clustering would just be monetary buckets.
 */
export function kmeans(
  points: number[][],
  k: number,
  opts: { maxIterations?: number; seed?: number } = {},
): KMeansResult {
  const maxIterations = opts.maxIterations ?? 100;
  const n = points.length;
  const dims = points[0]?.length ?? 0;

  if (n === 0 || dims === 0) return { assignments: [], centroids: [], inertia: 0, iterations: 0 };
  if (k >= n) {
    // More clusters than points -- every point is its own cluster.
    return { assignments: points.map((_, i) => i), centroids: points.map((p) => [...p]), inertia: 0, iterations: 0 };
  }

  // A seeded LCG keeps clustering deterministic across runs when a seed is
  // supplied (useful for reproducible demo data / tests) without pulling in a
  // PRNG dependency.
  let state = opts.seed ?? 42;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };

  let centroids = seedCentroids(points, k, random);
  let assignments = new Array<number>(n).fill(-1);
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

    centroids = centroids.map((old, c) =>
      counts[c] === 0 ? old : sums[c].map((sum) => sum / counts[c]),
    );
  }

  const inertia = points.reduce((sum, p, i) => sum + squaredDistance(p, centroids[assignments[i]]), 0);

  return { assignments, centroids, inertia, iterations };
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
