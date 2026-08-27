/**
 * Holt-Winters additive triple exponential smoothing.
 *
 * The linear-trend + day-of-week-index forecast is a fine transparent
 * baseline, but it assumes the trend is a straight line for the whole
 * look-back window. Holt-Winters instead keeps three quantities that each
 * adapt as new data arrives:
 *
 *   level   l_t = α·(y_t − s_{t−m}) + (1−α)·(l_{t−1} + b_{t−1})
 *   trend   b_t = β·(l_t − l_{t−1}) + (1−β)·b_{t−1}
 *   season  s_t = γ·(y_t − l_t)     + (1−γ)·s_{t−m}
 *
 *   forecast  ŷ_{t+h} = l_t + h·b_t + s_{t−m + ((h−1) mod m) + 1}
 *
 * It still has only three interpretable parameters and no black box; it just
 * tracks a changing trend and a repeating weekly pattern properly. m = 7
 * (weekly seasonality on daily data).
 */

export interface HoltWintersFit {
  fitted: number[];
  level: number;
  trend: number;
  season: number[];
  /** index of the last observation modulo m, so forecasting can continue the cycle */
  lastSeasonIndex: number;
  alpha: number;
  beta: number;
  gamma: number;
  sse: number;
  m: number;
}

function runHoltWinters(y: number[], m: number, alpha: number, beta: number, gamma: number): HoltWintersFit {
  const n = y.length;

  // --- seed from the first two whole seasons ---
  const firstSeason = y.slice(0, m);
  const secondSeason = y.slice(m, 2 * m);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

  let level = mean(firstSeason);
  let trend = (mean(secondSeason) - mean(firstSeason)) / m;
  const season = firstSeason.map((v) => v - level);

  const fitted: number[] = [];
  let sse = 0;

  for (let t = 0; t < n; t++) {
    const seasonIdx = t % m;
    const prevLevel = level;
    const forecast = level + trend + season[seasonIdx];
    fitted.push(forecast);

    if (t >= m) {
      const observed = y[t];
      level = alpha * (observed - season[seasonIdx]) + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      season[seasonIdx] = gamma * (observed - level) + (1 - gamma) * season[seasonIdx];
      const err = observed - forecast;
      sse += err * err;
    }
  }

  return { fitted, level, trend, season, lastSeasonIndex: (n - 1) % m, alpha, beta, gamma, sse, m };
}

/**
 * Fits Holt-Winters, grid-searching α, β, γ to minimise in-sample SSE. Needs
 * at least two full seasons of data; returns null otherwise so the caller can
 * fall back to the linear model.
 */
export function fitHoltWinters(y: number[], m = 7): HoltWintersFit | null {
  if (y.length < 2 * m + 1) return null;

  const grid = [0.05, 0.15, 0.3, 0.5, 0.7, 0.9];
  let best: HoltWintersFit | null = null;

  for (const alpha of grid) {
    for (const beta of grid) {
      for (const gamma of grid) {
        const fit = runHoltWinters(y, m, alpha, beta, gamma);
        if (!Number.isFinite(fit.sse)) continue;
        if (!best || fit.sse < best.sse) best = fit;
      }
    }
  }

  return best;
}

/** Projects `h` steps past the end of the fitted series. */
export function forecastHoltWinters(fit: HoltWintersFit, h: number): number[] {
  const out: number[] = [];
  for (let step = 1; step <= h; step++) {
    const seasonIdx = (fit.lastSeasonIndex + step) % fit.m;
    out.push(Math.max(0, fit.level + step * fit.trend + fit.season[seasonIdx]));
  }
  return out;
}
