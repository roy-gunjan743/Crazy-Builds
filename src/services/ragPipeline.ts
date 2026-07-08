/**
 * Shared RAG / Pipeline type definitions.
 * All actual logic lives on the backend (server/services/ragPipeline.ts).
 * This file is types-only — zero runtime code, zero mocks, zero fallbacks.
 */

export interface DataChunk {
  id: string;
  text: string;
  embedding?: number[];
  rowIndexStart: number;
  rowIndexEnd: number;
}

export interface QueryStep {
  name: string;
  status: 'pending' | 'success' | 'failed';
  detail?: string;
  code?: string;
  result?: any;
}

export interface RcaNode {
  id: string;
  label: string;
  value: string;
  type: 'region' | 'product' | 'campaign' | 'seasonality' | 'synthesis';
  status: 'active' | 'eliminated';
  connections: string[];
  x: number;
  y: number;
  confidence?: number;
}

export interface PersonaVoices {
  cfo: string;
  growth: string;
  risk: string;
}

export interface RagResult {
  answer: string;
  steps: QueryStep[];
  chartConfig?: {
    type: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
    title: string;
    xAxisKey: string;
    yAxisKey: string;
    data: any[];
  };
  retrievedChunks: DataChunk[];
  rcaGraph?: RcaNode[];
  personas?: PersonaVoices;
}
