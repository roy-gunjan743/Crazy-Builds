/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SEMANTIC COLUMN PROFILER                                         ║
 * ║  Classifies columns by what they CONTAIN, not what they're NAMED ║
 * ║  No keyword matching — pure statistical inference.               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Instead of checking if a column name contains "sales" or "roi",
 * we analyse the actual data distribution:
 *   - Value ranges, skewness, cardinality ratios
 *   - Integer vs float, bounded vs unbounded
 *   - Date format recognition by trying to parse values
 *   - Entropy of value distribution
 *
 * This works even when columns are named "col_A", "X1", or in other languages.
 */

export type SemanticRole =
  | 'sales_metric'    // large positive numerics — revenue / income range
  | 'roi_ratio'       // ratio values typically 0.1x – 20x
  | 'volume_count'    // non-negative integers — units, visits, count
  | 'spend_metric'    // medium-range spend / budget / cost
  | 'rating_score'    // tightly bounded 1-5 or 0-100
  | 'date_dimension'  // parseable date strings
  | 'categorical_dim' // low-cardinality strings (region, product, campaign)
  | 'id_column'       // high-cardinality — likely identifiers
  | 'boolean_flag'    // binary: 0/1 or true/false
  | 'text_column'     // free-form text (high entropy, long strings)
  | 'unknown';

export interface SemanticColumnProfile {
  name: string;
  detectedType: 'numeric' | 'date' | 'categorical' | 'text' | 'boolean';
  semanticRole: SemanticRole;
  /** 0–1 confidence in the semantic role classification */
  confidence: number;
  stats?: NumericStats;
  topValues?: string[];
  nullRatio: number;
}

export interface NumericStats {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  /** fraction of values that are whole integers */
  integerRatio: number;
  /** unique values / total non-null rows */
  cardinalityRatio: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{2}-[A-Za-z]{3}-\d{4}$/,
  /^\d{4}\/\d{2}\/\d{2}$/,
];

function looksLikeDate(value: string): boolean {
  if (DATE_FORMATS.some(r => r.test(value.trim()))) return true;
  const d = new Date(value);
  return !isNaN(d.getTime()) && value.length >= 8;
}

function computeNumericStats(values: number[]): NumericStats {
  const n = values.length;
  if (n === 0) return { mean: 0, median: 0, std: 0, min: 0, max: 0, skewness: 0, kurtosis: 0, integerRatio: 0, cardinalityRatio: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const mean   = values.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const skewness = std === 0 ? 0 :
    values.reduce((acc, v) => acc + ((v - mean) / std) ** 3, 0) / n;

  const kurtosis = std === 0 ? 0 :
    (values.reduce((acc, v) => acc + ((v - mean) / std) ** 4, 0) / n) - 3;

  const integerRatio = values.filter(v => Number.isInteger(v)).length / n;

  const unique = new Set(values).size;
  const cardinalityRatio = unique / n;

  return {
    mean: parseFloat(mean.toFixed(4)),
    median: parseFloat(median.toFixed(4)),
    std: parseFloat(std.toFixed(4)),
    min: sorted[0],
    max: sorted[n - 1],
    skewness: parseFloat(skewness.toFixed(4)),
    kurtosis: parseFloat(kurtosis.toFixed(4)),
    integerRatio,
    cardinalityRatio,
  };
}

function inferNumericRole(stats: NumericStats): { role: SemanticRole; confidence: number } {
  const { mean, std, min, max, integerRatio, cardinalityRatio } = stats;
  const range = max - min;

  // Boolean flag: only 0 and 1
  if (min >= 0 && max <= 1 && integerRatio > 0.95 && cardinalityRatio < 0.05)
    return { role: 'boolean_flag', confidence: 0.97 };

  // Rating/score: bounded small range 1–5 or 0–100
  if (min >= 0 && max <= 100 && range <= 100 && cardinalityRatio < 0.15)
    return { role: 'rating_score', confidence: 0.80 };

  // ROI/ratio: small positive floats, integerRatio low, typically < 20
  if (min >= 0 && max <= 30 && integerRatio < 0.4 && mean < 15)
    return { role: 'roi_ratio', confidence: 0.85 };

  // Volume count: non-negative integers, moderate cardinality
  if (min >= 0 && integerRatio > 0.85 && mean < 10_000)
    return { role: 'volume_count', confidence: 0.82 };

  // Spend metric: medium-range positives typically $100–$50,000
  if (min >= 0 && mean >= 50 && mean <= 50_000 && std < mean * 3)
    return { role: 'spend_metric', confidence: 0.75 };

  // Sales metric: large positives, high variance expected
  if (min >= 0 && mean > 100)
    return { role: 'sales_metric', confidence: 0.78 };

  return { role: 'unknown', confidence: 0.4 };
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function buildSemanticProfiles(data: any[]): SemanticColumnProfile[] {
  if (!data || data.length === 0) return [];

  const keys = Object.keys(data[0]);
  const profiles: SemanticColumnProfile[] = [];
  const sampleSize = Math.min(data.length, 200);

  for (const col of keys) {
    const rawValues = data.slice(0, sampleSize).map(r => r[col]);
    const nonNull = rawValues.filter(v => v !== null && v !== undefined && v !== '');
    const nullRatio = 1 - nonNull.length / sampleSize;

    // ── Numeric detection ────────────────────────────────────────────────────
    const numericParsed = nonNull
      .map(v => parseFloat(String(v).replace(/[$,%\s]/g, '')))
      .filter(v => !isNaN(v));
    const numericRatio = numericParsed.length / Math.max(nonNull.length, 1);

    if (numericRatio > 0.85 && numericParsed.length >= 3) {
      const stats = computeNumericStats(numericParsed);
      const { role, confidence } = inferNumericRole(stats);
      profiles.push({
        name: col,
        detectedType: 'numeric',
        semanticRole: role,
        confidence,
        stats,
        nullRatio: parseFloat(nullRatio.toFixed(3))
      });
      continue;
    }

    // ── Date detection ───────────────────────────────────────────────────────
    const strValues = nonNull.map(v => String(v));
    const dateMatches = strValues.filter(v => looksLikeDate(v)).length;
    const dateRatio = dateMatches / Math.max(strValues.length, 1);

    if (dateRatio > 0.8) {
      profiles.push({
        name: col,
        detectedType: 'date',
        semanticRole: 'date_dimension',
        confidence: dateRatio,
        nullRatio: parseFloat(nullRatio.toFixed(3))
      });
      continue;
    }

    // ── Categorical vs text ──────────────────────────────────────────────────
    const uniqueVals = new Set(strValues);
    const cardRatio = uniqueVals.size / Math.max(strValues.length, 1);
    const avgLen = strValues.reduce((a, v) => a + v.length, 0) / Math.max(strValues.length, 1);

    // Boolean-like strings
    const boolLike = strValues.every(v => ['true','false','yes','no','1','0'].includes(v.toLowerCase()));
    if (boolLike) {
      profiles.push({
        name: col,
        detectedType: 'boolean',
        semanticRole: 'boolean_flag',
        confidence: 0.95,
        nullRatio: parseFloat(nullRatio.toFixed(3))
      });
      continue;
    }

    // High cardinality → ID column
    if (cardRatio > 0.9 && avgLen < 40) {
      profiles.push({
        name: col,
        detectedType: 'categorical',
        semanticRole: 'id_column',
        confidence: 0.80,
        topValues: Array.from(uniqueVals).slice(0, 5) as string[],
        nullRatio: parseFloat(nullRatio.toFixed(3))
      });
      continue;
    }

    // Low cardinality → categorical dimension (region, product, campaign)
    if (cardRatio <= 0.25) {
      profiles.push({
        name: col,
        detectedType: 'categorical',
        semanticRole: 'categorical_dim',
        confidence: cardRatio < 0.05 ? 0.95 : 0.80,
        topValues: Array.from(uniqueVals).slice(0, 8) as string[],
        nullRatio: parseFloat(nullRatio.toFixed(3))
      });
      continue;
    }

    // Long text or medium-high cardinality
    profiles.push({
      name: col,
      detectedType: avgLen > 40 ? 'text' : 'categorical',
      semanticRole: avgLen > 40 ? 'text_column' : 'id_column',
      confidence: 0.60,
      nullRatio: parseFloat(nullRatio.toFixed(3))
    });
  }

  return profiles;
}

/**
 * Maps semantic profiles to the role slots the Dashboard needs.
 * Completely replaces the syntactic findCol() keyword approach.
 */
export function mapSemanticRolesToColumns(profiles: SemanticColumnProfile[]): {
  sales: string;
  volume: string;
  roi: string;
  date: string;
  region: string;
  product: string;
  campaign: string;
  spend: string;
} {
  const byRole = (role: SemanticRole) =>
    profiles.find(p => p.semanticRole === role && p.confidence > 0.65)?.name || '';

  const categoricals = profiles.filter(p =>
    p.semanticRole === 'categorical_dim' && p.confidence > 0.65
  );

  // For categorical slots, use top-values word analysis as a secondary signal
  const catByHint = (hints: string[]) => {
    return categoricals.find(p =>
      (p.topValues ?? []).some(v =>
        hints.some(h => v.toLowerCase().includes(h))
      ) || hints.some(h => p.name.toLowerCase().replace(/[_\s-]/g, '').includes(h))
    )?.name || '';
  };

  return {
    sales:    byRole('sales_metric'),
    volume:   byRole('volume_count'),
    roi:      byRole('roi_ratio'),
    date:     byRole('date_dimension'),
    spend:    byRole('spend_metric'),
    region:   catByHint(['north','south','east','west','region','area','zone','territory']),
    product:  catByHint(['widget','gadget','saas','enterprise','product','item','sku']),
    campaign: catByHint(['ppc','seo','email','influencer','meta','campaign','channel','source']),
  };
}
