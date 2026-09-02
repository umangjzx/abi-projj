import { prisma } from '../../lib/prisma';
import { round2, toNumber } from '../../lib/money';
import { kmeans, chooseK, standardize, logScale } from '../../lib/kmeans';
import { REVENUE_STATUSES } from '../orders/order.service';

const DAY_MS = 86_400_000;

export interface CustomerRfm {
  userId: string;
  name: string;
  email: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  /** 1 (worst) - 5 (best) per dimension, quintile-based within this customer base. */
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  /** Sum of the three scores, 3-15. */
  rfmScore: number;
  segment: RfmSegment;
}

export type RfmSegment =
  | 'Champions'
  | 'Loyal Customers'
  | 'Potential Loyalists'
  | 'At Risk'
  | 'Hibernating'
  | 'Lost';

/**
 * Assigns quintile scores (1-5) within *this* customer base rather than
 * against fixed cutoffs -- a store with 50 customers and one with 50,000
 * both get a meaningful 1-5 spread instead of everyone landing in the same
 * bucket because absolute order counts differ by store size.
 *
 * Scoring is by *value quantile*, not by rank position: everyone at or below
 * the 20th percentile of the metric gets a 1, up to the 40th a 2, and so on.
 * This means two customers with the identical spend always get the identical
 * score (a pure rank cut would arbitrarily split ties across bucket edges).
 */
function quintileScores(values: number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const quantileAt = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  // Cut points at the 20/40/60/80th percentiles.
  const cuts = [0.2, 0.4, 0.6, 0.8].map(quantileAt);

  return values.map((value) => {
    let bucket = 1;
    for (const cut of cuts) if (value > cut) bucket += 1;
    // bucket is now 1..5 in "higher value = higher bucket" terms.
    return higherIsBetter ? bucket : 6 - bucket;
  });
}

function segmentFor(r: number, f: number, m: number): RfmSegment {
  const avg = (r + f + m) / 3;
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions';
  if (f >= 4 && m >= 3) return 'Loyal Customers';
  if (r >= 4 && avg >= 3) return 'Potential Loyalists';
  if (r <= 2 && f >= 3) return 'At Risk';
  if (r <= 2 && f <= 2 && m <= 2) return 'Lost';
  return 'Hibernating';
}

export const customerIntelligenceService = {
  /**
   * True RFM: Recency (days since last order), Frequency (order count) and
   * Monetary (lifetime spend), each quintile-scored 1-5 within the current
   * customer base, combined into a 3-15 RFM score and mapped to a named
   * segment. This is the analysis that feeds `cluster()` below; it is also
   * useful standalone for a "who are my best customers" report.
   */
  async rfm(): Promise<CustomerRfm[]> {
    const customers = await prisma.user.findMany({
      where: { role: { name: 'CUSTOMER' } },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        orders: {
          where: { status: { in: REVENUE_STATUSES } },
          select: { placedAt: true, total: true },
        },
      },
    });

    const now = Date.now();
    const raw = customers.map((customer) => {
      const orders = customer.orders;
      const lastOrder = orders.reduce<Date | null>(
        (latest, o) => (!latest || o.placedAt > latest ? o.placedAt : latest),
        null,
      );
      const monetary = orders.reduce((sum, o) => sum + toNumber(o.total), 0);
      // A customer who has never ordered is scored as maximally "not recent"
      // rather than excluded, so churned/never-purchased accounts still
      // appear (correctly, at the bottom) in the segmentation.
      const recencyDays = lastOrder ? Math.floor((now - lastOrder.getTime()) / DAY_MS) : Math.floor((now - customer.createdAt.getTime()) / DAY_MS) + 365;

      return { userId: customer.id, name: customer.name, email: customer.email, recencyDays, frequency: orders.length, monetary: round2(monetary) };
    });

    const recencyScores = quintileScores(raw.map((r) => r.recencyDays), false);
    const frequencyScores = quintileScores(raw.map((r) => r.frequency), true);
    const monetaryScores = quintileScores(raw.map((r) => r.monetary), true);

    return raw.map((customer, index) => {
      const recencyScore = recencyScores[index];
      const frequencyScore = frequencyScores[index];
      const monetaryScore = monetaryScores[index];
      return {
        ...customer,
        recencyScore,
        frequencyScore,
        monetaryScore,
        rfmScore: recencyScore + frequencyScore + monetaryScore,
        segment: segmentFor(recencyScore, frequencyScore, monetaryScore),
      };
    });
  },

  /**
   * K-Means clustering over the three RFM features. This is a genuinely
   * different technique from the rule-based `segment` above: rather than
   * hand-written thresholds, it lets the actual distribution of this store's
   * customers define the groups, then labels each resulting cluster by its
   * centroid so the output is still readable by a non-technical admin.
   *
   * Pipeline (each step is here for a concrete reason):
   *   1. logScale on frequency + monetary  -- both are heavily right-skewed;
   *      without this the clusters collapse to "one big spender vs the rest".
   *   2. standardize (z-score) all three   -- so recency-in-days (0..700) does
   *      not dominate frequency (0..~20) purely because its numbers are bigger.
   *   3. chooseK by silhouette when k is not given, so the number of segments
   *      is data-driven, not a guess. The elbow (inertia) curve is returned
   *      too. 10 random restarts, best inertia kept.
   */
  async cluster(k?: number) {
    const rfm = await this.rfm();
    if (rfm.length === 0) return { clusters: [], k: 0 };

    const features = rfm.map((c) => [c.recencyDays, c.frequency, c.monetary]);
    // columns 1 (frequency) and 2 (monetary) are the skewed ones.
    const prepared = standardize(logScale(features, [1, 2]));

    // Cap the search so we do not fit more segments than the base can support:
    // roughly sqrt(n/2) clusters, e.g. ~3 for 18 customers, 5 for 50, 6 for 72+.
    const maxK = Math.max(2, Math.min(6, Math.round(Math.sqrt(rfm.length / 2)), rfm.length - 1));
    const selection = k
      ? { k: Math.min(k, rfm.length), silhouette: 0, candidates: [] as { k: number; inertia: number; silhouette: number }[] }
      : chooseK(prepared, { min: 2, max: maxK, seed: 7 });

    const effectiveK = Math.max(1, Math.min(selection.k, rfm.length));
    const result = kmeans(prepared, effectiveK, { seed: 7, restarts: 10 });

    const clusters = Array.from({ length: effectiveK }, (_, clusterIndex) => {
      const members = rfm.filter((_, i) => result.assignments[i] === clusterIndex);
      if (members.length === 0) {
        return { clusterIndex, label: 'Empty', size: 0, avgRecencyDays: 0, avgFrequency: 0, avgMonetary: 0, members: [] };
      }

      const avgRecencyDays = round2(members.reduce((sum, m) => sum + m.recencyDays, 0) / members.length);
      const avgFrequency = round2(members.reduce((sum, m) => sum + m.frequency, 0) / members.length);
      const avgMonetary = round2(members.reduce((sum, m) => sum + m.monetary, 0) / members.length);

      return {
        clusterIndex,
        label: labelCluster(avgRecencyDays, avgFrequency, avgMonetary, rfm),
        size: members.length,
        avgRecencyDays,
        avgFrequency,
        avgMonetary,
        members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, segment: m.segment })),
      };
    });

    // Two genuinely different clusters can land on the same centroid label
    // (e.g. two "Dormant / at risk" groups that differ mainly on recency).
    // Append the dimension that actually separates them so every label is
    // unique and still descriptive.
    disambiguateLabels(clusters);

    return {
      k: effectiveK,
      kSelection: k ? 'manual' : 'auto (silhouette)',
      silhouette: round2(result.silhouette),
      inertia: round2(result.inertia),
      elbow: selection.candidates,
      clusters: clusters.sort((a, b) => b.avgMonetary - a.avgMonetary),
    };
  },
};

/**
 * Makes cluster labels unique. For any label shared by 2+ clusters, finds the
 * RFM dimension with the widest relative spread across the colliding group and
 * appends a short comparative ("- more recent" / "- higher spend" / ...).
 */
function disambiguateLabels(
  clusters: { label: string; avgRecencyDays: number; avgFrequency: number; avgMonetary: number }[],
): void {
  const groups = new Map<string, typeof clusters>();
  for (const c of clusters) {
    const g = groups.get(c.label);
    if (g) g.push(c);
    else groups.set(c.label, [c]);
  }

  const relativeSpread = (values: number[]) => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    return max === min ? 0 : (max - min) / (Math.abs(max) + Math.abs(min) || 1);
  };

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const dimensions = [
      { spread: relativeSpread(group.map((c) => c.avgRecencyDays)), ends: ['more recent', 'less recent'], value: (c: (typeof group)[number]) => c.avgRecencyDays },
      { spread: relativeSpread(group.map((c) => c.avgFrequency)), ends: ['orders less often', 'orders more often'], value: (c: (typeof group)[number]) => c.avgFrequency },
      { spread: relativeSpread(group.map((c) => c.avgMonetary)), ends: ['lower spend', 'higher spend'], value: (c: (typeof group)[number]) => c.avgMonetary },
    ];
    const dim = dimensions.sort((a, b) => b.spread - a.spread)[0];

    const ordered = [...group].sort((a, b) => dim.value(a) - dim.value(b)); // ascending
    ordered.forEach((c, i) => {
      const tag = i === 0 ? dim.ends[0] : i === ordered.length - 1 ? dim.ends[1] : 'mid';
      c.label = `${c.label} - ${tag}`;
    });
  }
}

/**
 * Turns a cluster's centroid averages into a human label by comparing them
 * against the whole customer base's median -- "high spend, frequent, recent"
 * reads as Champions regardless of which literal cluster index k-means
 * happened to assign it.
 */
function labelCluster(avgRecencyDays: number, avgFrequency: number, avgMonetary: number, all: CustomerRfm[]): string {
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };

  const medianRecency = median(all.map((c) => c.recencyDays));
  const medianFrequency = median(all.map((c) => c.frequency));
  const medianMonetary = median(all.map((c) => c.monetary));

  const recent = avgRecencyDays <= medianRecency;
  const frequent = avgFrequency >= medianFrequency;
  const highSpend = avgMonetary >= medianMonetary;

  if (recent && frequent && highSpend) return 'High-value regulars';
  if (frequent && highSpend) return 'Big spenders (less recent)';
  if (recent && frequent) return 'Frequent, modest spend';
  if (recent && !frequent && !highSpend) return 'New / low-engagement';
  if (!recent && !frequent && !highSpend) return 'Dormant / at risk';
  return 'Occasional shoppers';
}
