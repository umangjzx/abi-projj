import { prisma } from '../../lib/prisma';
import { round2, toNumber } from '../../lib/money';
import { kmeans, minMaxScale } from '../../lib/kmeans';
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
 */
function quintileScores(values: number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n === 0) return [];

  const sortedIndices = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (higherIsBetter ? a.value - b.value : b.value - a.value));

  const scores = new Array<number>(n);
  sortedIndices.forEach(({ index }, rank) => {
    // rank 0 = worst, so +1 keeps scores in the natural 1..5 "best" direction.
    scores[index] = Math.min(5, Math.floor((rank / n) * 5) + 1);
  });
  return scores;
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
   * K-Means clustering over the same three RFM features (min-max scaled so
   * recency-in-days doesn't dominate a 1-5 frequency score). This is a
   * genuinely different technique from the rule-based `segment` above: rather
   * than hand-written thresholds, it lets the actual distribution of this
   * store's customers define the groups, then labels each resulting cluster
   * by its centroid so the output is still readable by a non-technical admin.
   */
  async cluster(k = 4) {
    const rfm = await this.rfm();
    if (rfm.length === 0) return { clusters: [], k: 0 };

    const effectiveK = Math.min(k, rfm.length);
    const features = rfm.map((c) => [c.recencyDays, c.frequency, c.monetary]);
    const scaled = minMaxScale(features);

    const result = kmeans(scaled, effectiveK, { seed: 7 });

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

    return {
      k: effectiveK,
      inertia: round2(result.inertia),
      clusters: clusters.sort((a, b) => b.avgMonetary - a.avgMonetary),
    };
  },
};

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
