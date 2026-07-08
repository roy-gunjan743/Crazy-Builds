import type { AutoencoderResult } from './autoencoderAgent';

export interface AnomalyRecord {
  columnName: string;
  rowIndex: number;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  details: string;
}

export interface GrowthRecord {
  month: string;
  value: number;
  changePercent: number;
}

export interface RollingRecord {
  date: string;
  value: number;
  rollingAvg: number;
  isBreak: boolean;
}

export interface AnalysisResult {
  anomalies: AnomalyRecord[];
  momGrowth: GrowthRecord[];
  rollingAverage: RollingRecord[];
  /** Full autoencoder result — undefined if not yet trained */
  autoencoder?: AutoencoderResult;
}

// Calculate mean and standard deviation
function getStats(values: number[]) {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  
  const sqDiffSum = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  const stdDev = Math.sqrt(sqDiffSum / values.length);
  
  return { mean, stdDev };
}

// Z-Score calculation
export function detectZScoreAnomalies(data: any[], colName: string): AnomalyRecord[] {
  const numericValues = data
    .map(row => Number(row[colName]))
    .filter(val => !isNaN(val) && val !== null && val !== undefined);

  if (numericValues.length < 5) return [];

  const { mean, stdDev } = getStats(numericValues);
  if (stdDev === 0) return [];

  const anomalies: AnomalyRecord[] = [];

  data.forEach((row, idx) => {
    const val = Number(row[colName]);
    if (isNaN(val) || val === null || val === undefined) return;

    const zScore = (val - mean) / stdDev;
    if (Math.abs(zScore) > 2) {
      const direction = zScore > 0 ? 'higher' : 'lower';
      const pctDiff = Math.abs(((val - mean) / mean) * 100).toFixed(1);
      anomalies.push({
        columnName: colName,
        rowIndex: idx,
        value: val,
        mean: parseFloat(mean.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        zScore: parseFloat(zScore.toFixed(2)),
        details: `Row ${idx} has a value of ${val} in '${colName}', which is ${pctDiff}% ${direction} than average (Z-score: ${zScore.toFixed(2)})`
      });
    }
  });

  return anomalies;
}

// Month-over-Month calculation
export function detectMoMGrowth(data: any[], dateCol: string, salesCol: string): GrowthRecord[] {
  const monthlySums: { [month: string]: number } = {};

  data.forEach(row => {
    const dateStr = String(row[dateCol]);
    if (!dateStr || dateStr === 'N/A') return;
    
    // Extract YYYY-MM
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return;
    
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const value = Number(row[salesCol]) || 0;
    
    monthlySums[yearMonth] = (monthlySums[yearMonth] || 0) + value;
  });

  const sortedMonths = Object.keys(monthlySums).sort();
  const records: GrowthRecord[] = [];

  sortedMonths.forEach((month, idx) => {
    const value = monthlySums[month];
    let changePercent = 0;
    
    if (idx > 0) {
      const prevValue = monthlySums[sortedMonths[idx - 1]];
      changePercent = prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : 0;
    }

    records.push({
      month,
      value: parseFloat(value.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(1))
    });
  });

  return records;
}

// 7-day or N-period Rolling Average
export function detectRollingAverageBreaks(
  data: any[], 
  dateCol: string, 
  salesCol: string, 
  period: number = 7
): RollingRecord[] {
  if (data.length === 0) return [];

  // Sort chronologically by date
  const sorted = [...data]
    .map(row => ({
      date: String(row[dateCol]),
      value: Number(row[salesCol]) || 0
    }))
    .filter(r => r.date && r.date !== 'N/A' && !isNaN(new Date(r.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length < period) return [];

  // Sum daily duplicates to make index timelines clean
  const dailyMap: { [date: string]: number } = {};
  sorted.forEach(item => {
    dailyMap[item.date] = (dailyMap[item.date] || 0) + item.value;
  });

  const dailyTimeline = Object.keys(dailyMap)
    .sort()
    .map(date => ({ date, value: dailyMap[date] }));

  return dailyTimeline.map((item, idx) => {
    // Determine bounds for rolling calculation
    const startIdx = Math.max(0, idx - period + 1);
    const slice = dailyTimeline.slice(startIdx, idx + 1);
    const sum = slice.reduce((acc, r) => acc + r.value, 0);
    const rollingAvg = sum / slice.length;

    // Detect breaks if current value is >50% or <40% compared to average
    let isBreak = false;
    if (idx >= period - 1) {
      const ratio = item.value / rollingAvg;
      isBreak = ratio < 0.6 || ratio > 1.5;
    }

    return {
      date: item.date,
      value: parseFloat(item.value.toFixed(2)),
      rollingAvg: parseFloat(rollingAvg.toFixed(2)),
      isBreak
    };
  });
}

// Global Agent Runner
export function runAnalyticsProfiling(data: any[]): AnalysisResult {
  const result: AnalysisResult = {
    anomalies: [],
    momGrowth: [],
    rollingAverage: []
  };

  if (!data || data.length === 0) return result;

  const keys = Object.keys(data[0]);

  // Semantic-aware numeric column detection
  const numericCols = keys.filter(k => {
    const sample = data.map(r => r[k]).filter(v => v !== null && v !== undefined && v !== '');
    const numCount = sample.filter(v => !isNaN(Number(v))).length;
    return numCount / sample.length > 0.8;
  });

  // Semantic date column: try parsing values, pick the column where >80% parse
  const dateCol = keys.find(k => {
    const sample = data.slice(0, 30).map(r => r[k]);
    const validDates = sample.filter(v => {
      if (!v) return false;
      const d = new Date(String(v));
      return !isNaN(d.getTime()) && String(v).length >= 8;
    });
    return validDates.length / sample.length > 0.8;
  }) || '';

  // Semantic sales column: pick the numeric column with the highest mean value
  const salesCol = numericCols.length > 0
    ? numericCols.reduce((best, col) => {
        const vals = data.map(r => Number(r[col])).filter(v => !isNaN(v));
        const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
        const bestVals = data.map(r => Number(r[best])).filter(v => !isNaN(v));
        const bestMean = bestVals.reduce((a, b) => a + b, 0) / Math.max(bestVals.length, 1);
        return mean > bestMean ? col : best;
      })
    : '';

  // 1. Z-score anomalies on all numeric columns
  numericCols.forEach(col => {
    const colAnomalies = detectZScoreAnomalies(data, col);
    result.anomalies.push(...colAnomalies);
  });

  // 2. MoM growth + Rolling Average (if date and sales columns found)
  if (dateCol && salesCol) {
    result.momGrowth = detectMoMGrowth(data, dateCol, salesCol);
    result.rollingAverage = detectRollingAverageBreaks(data, dateCol, salesCol, 7);
  }

  return result;
}

/**
 * Async variant that also runs the TF.js autoencoder.
 * Called from the /api/analytics endpoint.
 */
export async function runFullAnalytics(data: any[]): Promise<AnalysisResult> {
  const base = runAnalyticsProfiling(data);
  try {
    const { runAutoencoder } = await import('./autoencoderAgent');
    const aeResult = await runAutoencoder(data);
    base.autoencoder = aeResult;
  } catch (e: any) {
    console.error('[Autoencoder] Training failed:', e.message);
  }
  return base;
}
