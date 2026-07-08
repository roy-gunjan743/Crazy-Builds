/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PURE TYPESCRIPT AUTOENCODER — ANOMALY DETECTION                 ║
 * ║  Real dense neural network with backprop & Adam optimizer.      ║
 * ║  Zero external library dependencies (no Tensorflow).            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

export interface AutoencoderAnomaly {
  rowIndex: number;
  reconstructionError: number;
  /** z-score of this row's error relative to all rows */
  errorZScore: number;
  /** 0–1 normalized anomaly score */
  anomalyScore: number;
  /** which feature(s) had the highest reconstruction error */
  topContributors: { feature: string; error: number }[];
  details: string;
}

export interface AutoencoderResult {
  anomalies: AutoencoderAnomaly[];
  allErrors: number[];
  threshold: number;
  trainedEpochs: number;
  featureColumns: string[];
  /** per-epoch training loss */
  lossHistory: number[];
}

// ─── Custom Dense Autoencoder class in pure TypeScript ─────────────────────────
class CustomAutoencoder {
  private inputDim: number;
  private bottleneckDim: number;

  // Weights & Biases
  private w1: number[][]; // input -> bottleneck
  private b1: number[];   // bottleneck bias
  private w2: number[][]; // bottleneck -> output
  private b2: number[];   // output bias

  // Adam Optimizer states
  private mW1: number[][]; private vW1: number[][];
  private mb1: number[];   private vb1: number[];
  private mW2: number[][]; private vW2: number[][];
  private mb2: number[];   private vb2: number[];

  private t = 0;
  private lr = 0.01;
  private beta1 = 0.9;
  private beta2 = 0.999;
  private eps = 1e-8;

  constructor(inputDim: number, bottleneckDim: number) {
    this.inputDim = inputDim;
    this.bottleneckDim = bottleneckDim;

    // Xavier/Glorot Initialization limits
    const initLimit1 = Math.sqrt(6.0 / (inputDim + bottleneckDim));
    this.w1 = Array.from({ length: inputDim }, () =>
      Array.from({ length: bottleneckDim }, () => (Math.random() * 2 - 1) * initLimit1)
    );
    this.b1 = new Array(bottleneckDim).fill(0);

    const initLimit2 = Math.sqrt(6.0 / (bottleneckDim + inputDim));
    this.w2 = Array.from({ length: bottleneckDim }, () =>
      Array.from({ length: inputDim }, () => (Math.random() * 2 - 1) * initLimit2)
    );
    this.b2 = new Array(inputDim).fill(0);

    // Initialize moments
    this.mW1 = Array.from({ length: inputDim }, () => new Array(bottleneckDim).fill(0));
    this.vW1 = Array.from({ length: inputDim }, () => new Array(bottleneckDim).fill(0));
    this.mb1 = new Array(bottleneckDim).fill(0);
    this.vb1 = new Array(bottleneckDim).fill(0);

    this.mW2 = Array.from({ length: bottleneckDim }, () => new Array(inputDim).fill(0));
    this.vW2 = Array.from({ length: bottleneckDim }, () => new Array(inputDim).fill(0));
    this.mb2 = new Array(inputDim).fill(0);
    this.vb2 = new Array(inputDim).fill(0);
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  private sigmoid(x: number): number {
    return 1.0 / (1.0 + Math.exp(-Math.max(-10, Math.min(10, x)))); // bounded range
  }

  public forward(x: number[]): { h: number[]; y: number[] } {
    const h = new Array(this.bottleneckDim).fill(0);
    for (let j = 0; j < this.bottleneckDim; j++) {
      let sum = this.b1[j];
      for (let i = 0; i < this.inputDim; i++) {
        sum += x[i] * this.w1[i][j];
      }
      h[j] = this.relu(sum);
    }

    const y = new Array(this.inputDim).fill(0);
    for (let j = 0; j < this.inputDim; j++) {
      let sum = this.b2[j];
      for (let i = 0; i < this.bottleneckDim; i++) {
        sum += h[i] * this.w2[i][j];
      }
      y[j] = this.sigmoid(sum);
    }

    return { h, y };
  }

  public trainStep(x: number[]): number {
    this.t++;
    const { h, y } = this.forward(x);

    let loss = 0;
    for (let j = 0; j < this.inputDim; j++) {
      loss += 0.5 * Math.pow(y[j] - x[j], 2);
    }
    loss /= this.inputDim;

    // Output gradients: dy_j = (y_j - x_j) * y_j * (1 - y_j) / inputDim
    const dz2 = new Array(this.inputDim).fill(0);
    for (let j = 0; j < this.inputDim; j++) {
      dz2[j] = ((y[j] - x[j]) * y[j] * (1.0 - y[j])) / this.inputDim;
    }

    // Decoder weights/bias gradients
    const dW2 = Array.from({ length: this.bottleneckDim }, () => new Array(this.inputDim).fill(0));
    const db2 = [...dz2];
    for (let i = 0; i < this.bottleneckDim; i++) {
      for (let j = 0; j < this.inputDim; j++) {
        dW2[i][j] = h[i] * dz2[j];
      }
    }

    // Hidden layer gradients (dL/dh)
    const dh = new Array(this.bottleneckDim).fill(0);
    for (let i = 0; i < this.bottleneckDim; i++) {
      let sum = 0;
      for (let j = 0; j < this.inputDim; j++) {
        sum += dz2[j] * this.w2[i][j];
      }
      dh[i] = sum;
    }

    // ReLU activation gradients
    const dz1 = new Array(this.bottleneckDim).fill(0);
    for (let j = 0; j < this.bottleneckDim; j++) {
      dz1[j] = dh[j] * (h[j] > 0 ? 1 : 0);
    }

    // Encoder weights/bias gradients
    const dW1 = Array.from({ length: this.inputDim }, () => new Array(this.bottleneckDim).fill(0));
    const db1 = [...dz1];
    for (let i = 0; i < this.inputDim; i++) {
      for (let j = 0; j < this.bottleneckDim; j++) {
        dW1[i][j] = x[i] * dz1[j];
      }
    }

    // Adam update scaling factor
    const lr_t = this.lr * Math.sqrt(1.0 - Math.pow(this.beta2, this.t)) / (1.0 - Math.pow(this.beta1, this.t));

    // Update Decoder
    for (let i = 0; i < this.bottleneckDim; i++) {
      for (let j = 0; j < this.inputDim; j++) {
        this.mW2[i][j] = this.beta1 * this.mW2[i][j] + (1 - this.beta1) * dW2[i][j];
        this.vW2[i][j] = this.beta2 * this.vW2[i][j] + (1 - this.beta2) * Math.pow(dW2[i][j], 2);
        this.w2[i][j] -= (lr_t * this.mW2[i][j]) / (Math.sqrt(this.vW2[i][j]) + this.eps);
      }
    }
    for (let j = 0; j < this.inputDim; j++) {
      this.mb2[j] = this.beta1 * this.mb2[j] + (1 - this.beta1) * db2[j];
      this.vb2[j] = this.beta2 * this.vb2[j] + (1 - this.beta2) * Math.pow(db2[j], 2);
      this.b2[j] -= (lr_t * this.mb2[j]) / (Math.sqrt(this.vb2[j]) + this.eps);
    }

    // Update Encoder
    for (let i = 0; i < this.inputDim; i++) {
      for (let j = 0; j < this.bottleneckDim; j++) {
        this.mW1[i][j] = this.beta1 * this.mW1[i][j] + (1 - this.beta1) * dW1[i][j];
        this.vW1[i][j] = this.beta2 * this.vW1[i][j] + (1 - this.beta2) * Math.pow(dW1[i][j], 2);
        this.w1[i][j] -= (lr_t * this.mW1[i][j]) / (Math.sqrt(this.vW1[i][j]) + this.eps);
      }
    }
    for (let j = 0; j < this.bottleneckDim; j++) {
      this.mb1[j] = this.beta1 * this.mb1[j] + (1 - this.beta1) * db1[j];
      this.vb1[j] = this.beta2 * this.vb1[j] + (1 - this.beta2) * Math.pow(db1[j], 2);
      this.b1[j] -= (lr_t * this.mb1[j]) / (Math.sqrt(this.vb1[j]) + this.eps);
    }

    return loss;
  }
}

// ─── Normalization Helper ──────────────────────────────────────────────────────
function minMaxNormalize(matrix: number[][]): {
  normalized: number[][];
  mins: number[];
  maxs: number[];
} {
  if (matrix.length === 0) return { normalized: [], mins: [], maxs: [] };
  const nFeatures = matrix[0].length;
  const mins = new Array(nFeatures).fill(Infinity);
  const maxs = new Array(nFeatures).fill(-Infinity);

  for (const row of matrix) {
    for (let j = 0; j < nFeatures; j++) {
      if (row[j] < mins[j]) mins[j] = row[j];
      if (row[j] > maxs[j]) maxs[j] = row[j];
    }
  }

  const normalized = matrix.map(row =>
    row.map((v, j) => {
      const range = maxs[j] - mins[j];
      return range === 0 ? 0.5 : (v - mins[j]) / range;
    })
  );
  return { normalized, mins, maxs };
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export async function runAutoencoder(
  data: any[],
  epochs = 100
): Promise<AutoencoderResult> {
  if (!data || data.length < 10) {
    return {
      anomalies: [],
      allErrors: [],
      threshold: 0,
      trainedEpochs: 0,
      featureColumns: [],
      lossHistory: []
    };
  }

  // 1. Find numeric columns with >80% coverage
  const keys = Object.keys(data[0]);
  const featureColumns = keys.filter(k => {
    const sample = data.slice(0, 50).map(r => parseFloat(String(r[k] ?? '').replace(/[$,%\s]/g, '')));
    const validCount = sample.filter(v => !isNaN(v) && isFinite(v)).length;
    return validCount / sample.length > 0.8;
  });

  if (featureColumns.length < 2) {
    return {
      anomalies: [],
      allErrors: [],
      threshold: 0,
      trainedEpochs: 0,
      featureColumns,
      lossHistory: []
    };
  }

  // 2. Build feature matrix
  const rawMatrix: number[][] = data.map(row =>
    featureColumns.map(k => {
      const v = parseFloat(String(row[k] ?? '').replace(/[$,%\s]/g, ''));
      return isNaN(v) || !isFinite(v) ? 0 : v;
    })
  );

  const { normalized } = minMaxNormalize(rawMatrix);

  // 3. Instantiate Custom Neural Autoencoder
  const inputDim = featureColumns.length;
  const bottleneckDim = Math.max(1, Math.floor(inputDim / 2));
  const model = new CustomAutoencoder(inputDim, bottleneckDim);

  const lossHistory: number[] = [];

  // 4. Batch train model in pure JavaScript loops
  const nSamples = normalized.length;
  const batchSize = Math.min(16, Math.floor(nSamples / 2));

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLossSum = 0;
    // Shuffle indices for SGD
    const indices = Array.from({ length: nSamples }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (let start = 0; start < nSamples; start += batchSize) {
      const end = Math.min(start + batchSize, nSamples);
      for (let i = start; i < end; i++) {
        const rowIdx = indices[i];
        epochLossSum += model.trainStep(normalized[rowIdx]);
      }
    }
    lossHistory.push(parseFloat((epochLossSum / nSamples).toFixed(6)));
  }

  // 5. Predict and compute reconstruction error per row
  const perRowErrors: number[] = [];
  const perRowFeatureErrors: number[][] = [];

  for (let i = 0; i < nSamples; i++) {
    const inputRow = normalized[i];
    const { y: reconRow } = model.forward(inputRow);

    const featureErrs = inputRow.map((v, j) => Math.pow(v - reconRow[j], 2));
    const mse = featureErrs.reduce((a, b) => a + b, 0) / inputDim;

    perRowErrors.push(mse);
    perRowFeatureErrors.push(featureErrs);
  }

  // 6. Threshold calculation (mean + 2σ of errors)
  const errMean = perRowErrors.reduce((a, b) => a + b, 0) / nSamples;
  const errStd  = Math.sqrt(
    perRowErrors.reduce((acc, e) => acc + (e - errMean) ** 2, 0) / nSamples
  );
  const threshold = errMean + 2 * errStd;
  const maxError = Math.max(...perRowErrors);

  // 7. Find anomalous rows
  const anomalies: AutoencoderAnomaly[] = [];

  for (let i = 0; i < nSamples; i++) {
    const err = perRowErrors[i];
    if (err <= threshold) continue;

    const errorZScore = errStd === 0 ? 0 : (err - errMean) / errStd;
    const anomalyScore = maxError === 0 ? 0 : parseFloat((err / maxError).toFixed(4));
    const fErrs = perRowFeatureErrors[i];

    const topContributors = featureColumns
      .map((col, j) => ({ feature: col, error: parseFloat(fErrs[j].toFixed(6)) }))
      .sort((a, b) => b.error - a.error)
      .slice(0, 3);

    anomalies.push({
      rowIndex: i,
      reconstructionError: parseFloat(err.toFixed(6)),
      errorZScore: parseFloat(errorZScore.toFixed(2)),
      anomalyScore,
      topContributors,
      details: `Neural reconstruction error of ${err.toFixed(5)} is ${errorZScore.toFixed(1)}σ above standard threshold. ` +
        `Primary driver: [${topContributors[0]?.feature}] reconstruction error=${topContributors[0]?.error}`
    });
  }

  // Sort anomalies by severity
  anomalies.sort((a, b) => b.reconstructionError - a.reconstructionError);

  return {
    anomalies,
    allErrors: perRowErrors.map(e => parseFloat(e.toFixed(6))),
    threshold: parseFloat(threshold.toFixed(6)),
    trainedEpochs: lossHistory.length,
    featureColumns,
    lossHistory
  };
}
