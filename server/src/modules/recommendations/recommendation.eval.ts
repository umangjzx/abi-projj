import { prisma } from '../../lib/prisma';
import { round2 } from '../../lib/money';
import { REVENUE_STATUSES } from '../orders/order.service';

// ============================================================================
//  Offline evaluation harness
//
//  "Is the recommender any good?" is answered here with numbers instead of a
//  hunch. The method is a *temporal hold-out*, which is how recommender
//  systems are evaluated in practice:
//
//    1. Sort every past order by date.
//    2. Train split  = the oldest (1 - testFraction) of orders.
//       Test split   = the most recent testFraction of orders.
//    3. For each customer active in both splits, generate top-K
//       recommendations using ONLY the training split, then check them
//       against what that customer actually bought in the test split.
//
//  The scorer below is a deliberately independent, compact re-implementation
//  of the production blend (reorder + category affinity + item-item lift +
//  popularity, fused with RRF, popularity-debiased, MMR-diversified). You do
//  not test a system with a copy of itself, and keeping the eval logic
//  separate means a bug in one is unlikely to hide a bug in the other.
//
//  Reported metrics (all averaged over the evaluated customers unless noted):
//
//    precisionAtK   fraction of the K recommendations that were bought
//    recallAtK      fraction of the customer's test purchases that were hit
//    mapAtK         mean average precision -- rewards putting hits near the top
//    ndcgAtK        normalised discounted cumulative gain -- same idea, log decay
//    coverage       share of the catalogue that got recommended to anyone
//                   (a model that only ever suggests 5 products scores badly)
//    diversity      1 - mean pairwise "same category" within a list
//                   (1.0 = every item a different category)
//    popularityBias mean popularity percentile of recommended items
//                   (lower is better -- high means "it just recommends bestsellers")
//
//  Two baselines are run alongside so the personalised model has something to
//  beat: MOST_POPULAR (train-set bestsellers, same for everyone) and RANDOM.
// ============================================================================

const RRF_K = 60;
const POPULARITY_PRIOR = 0.15;
const MMR_LAMBDA = 0.75;
const MAX_PER_CATEGORY = 3;

interface EvalOrder {
  userId: string;
  placedAt: number;
  productIds: string[];
}

type Model = 'PERSONALISED' | 'MOST_POPULAR' | 'RANDOM';

export const recommendationEval = {
  /**
   * @param k            list length to score at (Precision@K etc.)
   * @param testFraction most-recent share of orders held out for testing
   */
  async run({ k = 10, testFraction = 0.2 }: { k?: number; testFraction?: number } = {}) {
    const [orderRows, productRows] = await Promise.all([
      prisma.order.findMany({
        where: { status: { in: REVENUE_STATUSES } },
        select: { userId: true, placedAt: true, items: { select: { productId: true } } },
        orderBy: { placedAt: 'asc' },
      }),
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, categoryId: true } }),
    ]);

    const orders: EvalOrder[] = orderRows.map((o) => ({
      userId: o.userId,
      placedAt: o.placedAt.getTime(),
      productIds: [...new Set(o.items.map((i) => i.productId))],
    }));

    if (orders.length < 20) {
      return { sufficientData: false, message: 'Need at least 20 revenue orders to evaluate.', orders: orders.length };
    }

    const categoryOf = new Map(productRows.map((p) => [p.id, p.categoryId]));
    const catalogue = productRows.map((p) => p.id);

    // --- temporal split -----------------------------------------------------
    const splitIndex = Math.floor(orders.length * (1 - testFraction));
    const splitAt = orders[splitIndex].placedAt;
    const train = orders.filter((o) => o.placedAt < splitAt);
    const test = orders.filter((o) => o.placedAt >= splitAt);

    // --- train-set aggregates --------------------------------------------------
    const salesCount = new Map<string, number>(); // product -> baskets containing it
    const pairCount = new Map<string, number>(); // "a|b" (sorted) -> co-occurrence
    const userTrainBasket = new Map<string, Map<string, number>>(); // user -> product -> times bought
    const userTrainCategory = new Map<string, Map<string, number>>();

    for (const order of train) {
      for (const pid of order.productIds) {
        salesCount.set(pid, (salesCount.get(pid) ?? 0) + 1);
        const ub = userTrainBasket.get(order.userId) ?? new Map();
        ub.set(pid, (ub.get(pid) ?? 0) + 1);
        userTrainBasket.set(order.userId, ub);
        const cat = categoryOf.get(pid);
        if (cat) {
          const uc = userTrainCategory.get(order.userId) ?? new Map();
          uc.set(cat, (uc.get(cat) ?? 0) + 1);
          userTrainCategory.set(order.userId, uc);
        }
      }
      for (let i = 0; i < order.productIds.length; i++) {
        for (let j = i + 1; j < order.productIds.length; j++) {
          const key = [order.productIds[i], order.productIds[j]].sort().join('|');
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
      }
    }

    const trainBaskets = train.length || 1;
    const lift = (a: string, b: string) => {
      const co = pairCount.get([a, b].sort().join('|')) ?? 0;
      const ca = salesCount.get(a) ?? 0;
      const cb = salesCount.get(b) ?? 0;
      if (!co || !ca || !cb) return 0;
      return (co * trainBaskets) / (ca * cb);
    };

    // popularity percentile in [0, 1] over the train set (1 = most sold)
    const popRanked = [...catalogue].sort((x, y) => (salesCount.get(x) ?? 0) - (salesCount.get(y) ?? 0));
    const popularityPct = new Map(popRanked.map((id, i) => [id, i / Math.max(1, popRanked.length - 1)]));
    const mostPopular = [...popRanked].reverse();

    // --- build the per-user test set ----------------------------------------
    const testBasketByUser = new Map<string, Set<string>>();
    for (const order of test) {
      const set = testBasketByUser.get(order.userId) ?? new Set<string>();
      for (const pid of order.productIds) set.add(pid);
      testBasketByUser.set(order.userId, set);
    }

    const evalUsers = [...testBasketByUser.keys()].filter(
      (u) => userTrainBasket.has(u) && (testBasketByUser.get(u)?.size ?? 0) > 0,
    );

    if (evalUsers.length === 0) {
      return { sufficientData: false, message: 'No customer appears in both the train and test window.', orders: orders.length };
    }

    // --- recommenders -----------------------------------------------------------
    // Weighted Reciprocal Rank Fusion, mirroring PLACEMENT_WEIGHTS in the
    // production service: a personal signal outranks a generic one at the same
    // list position.
    const rrfFuse = (lists: { items: string[]; weight: number }[]): Map<string, number> => {
      const fused = new Map<string, number>();
      for (const { items, weight } of lists) {
        items.forEach((id, idx) => fused.set(id, (fused.get(id) ?? 0) + weight / (RRF_K + idx + 1)));
      }
      return fused;
    };

    const mmr = (scored: { id: string; score: number }[], protectedIds: Set<string> = new Set()): string[] => {
      const pool = [...scored].sort((a, b) => b.score - a.score);
      if (!pool.length) return [];
      const min = pool[pool.length - 1].score;
      const spread = (pool[0].score - min) || 1;
      const chosen: string[] = [];
      const catCount = new Map<string, number>();
      while (chosen.length < k && pool.length) {
        let bestIdx = -1;
        let bestVal = -Infinity;
        for (let i = 0; i < pool.length; i++) {
          const cat = categoryOf.get(pool[i].id) ?? '';
          const isProtected = protectedIds.has(pool[i].id);
          if (!isProtected && (catCount.get(cat) ?? 0) >= MAX_PER_CATEGORY) continue;
          const sim = isProtected || !chosen.some((c) => (categoryOf.get(c) ?? '') === cat) ? 0 : 1;
          const val = MMR_LAMBDA * ((pool[i].score - min) / spread) - (1 - MMR_LAMBDA) * sim;
          if (val > bestVal) {
            bestVal = val;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) bestIdx = 0;
        const [pick] = pool.splice(bestIdx, 1);
        chosen.push(pick.id);
        const cat = categoryOf.get(pick.id) ?? '';
        catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
      }
      return chosen;
    };

    // Deterministic PRNG so the RANDOM baseline is stable across re-runs.
    let rngState = 12345;
    const rng = () => {
      rngState = (rngState * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return rngState / 4_294_967_296;
    };

    const personalisedFor = (userId: string): string[] => {
      const basket = userTrainBasket.get(userId)!;
      const owned = new Set(basket.keys());

      // 1. reorder: the user's own products, most-bought first
      const reorder = [...basket.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

      // 2. category affinity: unowned products in the user's top train categories
      const topCats = [...(userTrainCategory.get(userId) ?? new Map()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([c]) => c);
      const catAffinity = catalogue
        .filter((id) => !owned.has(id) && topCats.includes(categoryOf.get(id) ?? ''))
        .sort((x, y) => (salesCount.get(y) ?? 0) - (salesCount.get(x) ?? 0));

      // 3. item-item lift from the user's basket
      const liftScores = new Map<string, number>();
      for (const seed of owned) {
        for (const cand of catalogue) {
          if (owned.has(cand)) continue;
          const l = lift(seed, cand);
          if (l > 1) liftScores.set(cand, Math.max(liftScores.get(cand) ?? 0, l));
        }
      }
      const liftList = [...liftScores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

      // 4. global popularity
      const fused = rrfFuse([
        { items: reorder, weight: 1.0 },
        { items: liftList, weight: 0.9 },
        { items: catAffinity, weight: 0.85 },
        { items: mostPopular, weight: 0.6 },
      ]);
      const maxFused = Math.max(...fused.values(), 1e-9);

      // Personal signals (own reorders, basket complements) are exempt from the
      // popularity penalty -- see POPULARITY_PRIOR in recommendation.service.ts.
      const personal = new Set([...reorder, ...liftList]);
      const scored = [...fused.entries()].map(([id, s]) => ({
        id,
        score: s / maxFused - (personal.has(id) ? 0 : POPULARITY_PRIOR * (popularityPct.get(id) ?? 0)),
      }));
      return mmr(scored, personal);
    };

    const recommend = (model: Model, userId: string): string[] => {
      if (model === 'MOST_POPULAR') return mostPopular.slice(0, k);
      if (model === 'RANDOM') {
        return [...catalogue]
          .map((id) => ({ id, r: rng() }))
          .sort((a, b) => a.r - b.r)
          .slice(0, k)
          .map((x) => x.id);
      }
      return personalisedFor(userId);
    };

    // --- scoring ------------------------------------------------------------
    const evaluate = (model: Model) => {
      let precision = 0;
      let recall = 0;
      let map = 0;
      let ndcg = 0;
      let diversity = 0;
      let popBias = 0;
      const recommendedGlobally = new Set<string>();

      for (const userId of evalUsers) {
        const recs = recommend(model, userId).slice(0, k);
        const truth = testBasketByUser.get(userId)!;
        recs.forEach((id) => recommendedGlobally.add(id));

        let hits = 0;
        let apSum = 0;
        let dcg = 0;
        recs.forEach((id, i) => {
          if (truth.has(id)) {
            hits += 1;
            apSum += hits / (i + 1);
            dcg += 1 / Math.log2(i + 2);
          }
        });
        const idealHits = Math.min(truth.size, k);
        const idcg = Array.from({ length: idealHits }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0) || 1;

        precision += hits / k;
        recall += hits / truth.size;
        map += hits ? apSum / Math.min(truth.size, k) : 0;
        ndcg += dcg / idcg;

        // intra-list diversity + popularity bias for this list
        let samePairs = 0;
        let pairs = 0;
        for (let i = 0; i < recs.length; i++) {
          popBias += popularityPct.get(recs[i]) ?? 0;
          for (let j = i + 1; j < recs.length; j++) {
            pairs += 1;
            if ((categoryOf.get(recs[i]) ?? '') === (categoryOf.get(recs[j]) ?? '')) samePairs += 1;
          }
        }
        diversity += pairs ? 1 - samePairs / pairs : 1;
      }

      const n = evalUsers.length;
      const totalRecSlots = n * k || 1;
      return {
        model,
        precisionAtK: round2((precision / n) * 100),
        recallAtK: round2((recall / n) * 100),
        mapAtK: round2((map / n) * 100),
        ndcgAtK: round2((ndcg / n) * 100),
        coverage: round2((recommendedGlobally.size / catalogue.length) * 100),
        diversity: round2(diversity / n),
        popularityBias: round2((popBias / totalRecSlots) * 100),
      };
    };

    const models: Model[] = ['PERSONALISED', 'MOST_POPULAR', 'RANDOM'];
    const results = models.map(evaluate);
    const personalised = results[0];
    const popular = results[1];
    const random = results[2];

    return {
      sufficientData: true,
      params: { k, testFraction },
      split: {
        trainOrders: train.length,
        testOrders: test.length,
        splitDate: new Date(splitAt).toISOString().slice(0, 10),
        evaluatedCustomers: evalUsers.length,
        catalogueSize: catalogue.length,
      },
      results,
      verdict: {
        // Ranking quality vs an untargeted list -- personalisation should clear
        // this comfortably.
        beatsRandomByMap: personalised.mapAtK > random.mapAtK,
        mapUpliftVsRandom: round2(personalised.mapAtK - random.mapAtK),
        // vs "just show the bestsellers": on a small staples-driven catalogue
        // the bestseller list is a strong ACCURACY baseline, so this can be
        // negative -- the trade is made back on the next three lines.
        ndcgUpliftVsPopular: round2(personalised.ndcgAtK - popular.ndcgAtK),
        catalogueCoverageMultipleVsPopular:
          popular.coverage > 0 ? round2(personalised.coverage / popular.coverage) : null,
        popularityBiasReductionVsPopular: round2(popular.popularityBias - personalised.popularityBias),
        moreDiverseThanPopular: personalised.diversity >= popular.diversity,
      },
      note:
        evalUsers.length < 15
          ? `Only ${evalUsers.length} customers had orders in both windows -- treat absolute numbers as indicative, not precise.`
          : undefined,
    };
  },
};
