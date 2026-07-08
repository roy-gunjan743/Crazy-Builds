import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

import { profileDataset, cleanDataset } from './services/dataCleaner';
import { BackendRagPipeline, QueryStep } from './services/ragPipeline';
import { runAnalyticsProfiling, runFullAnalytics } from './services/analyticsAgent';
import { runPiiShield, unmaskText, PiiReport } from './services/securityShield';

// Load global configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Uploads cache setup
const uploadsDir = path.join(process.cwd(), 'server/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: 'server/uploads/' });

// Initialize RAG Pipeline
const defaultGeminiKey = process.env.GEMINI_API_KEY || '';
const defaultGrokKey = process.env.GROK_API_KEY || '';
const pipeline = new BackendRagPipeline(defaultGeminiKey, defaultGrokKey);

// ── PII Shield — session-scoped, heap-only, never written to disk ─────────────
let activePiiReport: PiiReport | null = null;
let activeMappingTable: Map<string, string> = new Map();
// ──────────────────────────────────────────────────────────────────────────────

// Helpers to extract API keys from request headers
const getGeminiKey = (req: express.Request): string => {
  const headerKey = req.headers['x-gemini-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim() !== '') {
    return headerKey.trim();
  }
  return defaultGeminiKey;
};

const getGrokKey = (req: express.Request): string => {
  const headerKey = req.headers['x-grok-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim() !== '') {
    return headerKey.trim();
  }
  return defaultGrokKey;
};

// Endpoints

// File Upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const extension = req.file.originalname.split('.').pop()?.toLowerCase();
    let parsedData: any[] = [];

    if (extension === 'csv') {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const results = Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });
      parsedData = results.data;
    } else if (extension === 'xlsx' || extension === 'xls') {
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      parsedData = XLSX.utils.sheet_to_json(sheet, { defval: null });
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file format.' });
    }

    fs.unlinkSync(filePath);

    if (parsedData.length === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty.' });
    }

    // Process Cleaning and Profiling
    const initialProfiles = profileDataset(parsedData);
    const cleaned = cleanDataset(parsedData, initialProfiles);
    const updatedProfiles = profileDataset(cleaned);

    // ── PII Shield: scan → mask → store only masked rows ─────────────────────
    const shieldResult = runPiiShield(cleaned);
    activePiiReport  = shieldResult.piiReport;
    activeMappingTable = shieldResult.mappingTable;
    const dataToStore = shieldResult.maskedData;   // PII-free rows only
    // ─────────────────────────────────────────────────────────────────────────

    // RAG pipeline works on masked data
    pipeline.setData(dataToStore);

    // 1. Relational Database commit using Prisma — ONLY masked rows written
    const dbDataset = await prisma.dataset.create({
      data: {
        fileName: req.file.originalname,
        rowCount: dataToStore.length
      }
    });

    // Bulk save masked row lines (no raw PII on disk)
    await prisma.dataRow.createMany({
      data: dataToStore.map((row: any, idx: number) => ({
        datasetId: dbDataset.id,
        rowIndex: idx,
        dataJson: JSON.stringify(row)
      }))
    });

    // 2. Anomaly profiling and relational database logging
    const analytics = runAnalyticsProfiling(dataToStore);
    if (analytics.anomalies.length > 0) {
      await prisma.anomaly.createMany({
        data: analytics.anomalies.map((anom: any) => ({
          datasetId: dbDataset.id,
          columnName: anom.columnName,
          rowIndex: anom.rowIndex,
          value: anom.value,
          mean: anom.mean,
          stdDev: anom.stdDev,
          zScore: anom.zScore,
          details: anom.details
        }))
      });
    }

    res.json({
      success: true,
      fileName: req.file.originalname,
      dataLength: dataToStore.length,
      profiles: updatedProfiles,
      data: dataToStore,          // return masked data to frontend
      piiReport: activePiiReport  // return the scan report for the UI
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Load Demo Dataset
app.post('/api/upload-demo', async (req, res) => {
  try {
    const regions = ['North', 'South', 'East', 'West'];
    const products = ['Widget Pro', 'Gadget Plus', 'SaaS Core', 'Enterprise Suite'];
    const campaigns = ['Google PPC', 'Meta Retargeting', 'SEO Organic', 'Cold Email', 'Influencer Outpost'];
    const data = [];
    const baseDate = new Date('2026-01-01');
    
    for (let i = 0; i < 120; i++) {
      const currentDate = new Date(baseDate);
      currentDate.setDate(baseDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const region = regions[Math.floor(Math.random() * regions.length)];
      const product = products[Math.floor(Math.random() * products.length)];
      
      const month = currentDate.getMonth();
      let seasonality = 1.0;
      if (month === 1) seasonality = 0.65; // February dip (sales drop 40%)
      if (month === 3) seasonality = 1.35; // April spike
      
      let regionalMult = 1.0;
      if (region === 'West') regionalMult = 1.3;
      if (region === 'South') regionalMult = 0.85;

      const units = Math.floor((Math.random() * 80 + 20) * seasonality * regionalMult);
      
      let price = 49.99;
      if (product === 'Gadget Plus') price = 99.99;
      if (product === 'SaaS Core') price = 299.99;
      if (product === 'Enterprise Suite') price = 1200.00;

      const sales = parseFloat((units * price).toFixed(2));
      const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
      const campaignSpend = Math.floor(Math.random() * 500 + 100);
      
      let roi = parseFloat((Math.random() * 2.5 + 1.2).toFixed(2));
      if (campaign === 'Google PPC') roi = parseFloat((Math.random() * 4.0 + 2.0).toFixed(2));
      if (campaign === 'SEO Organic') roi = parseFloat((Math.random() * 5.0 + 3.0).toFixed(2));
      if (campaign === 'Cold Email') roi = parseFloat((Math.random() * 1.1 + 0.4).toFixed(2));

      const rating = parseFloat((Math.random() * 2.0 + 3.0).toFixed(1));

      // Revenue_Cost_ROI = Sales / Campaign_Spend (exact arithmetic, not random)
      const revenueCostRoi = parseFloat((sales / campaignSpend).toFixed(4));

      data.push({
        Date: dateStr,
        Region: region,
        Product: product,
        'Units_Sold': units,
        'Sales_Amount': sales,
        Campaign: campaign,
        'Campaign_Spend': campaignSpend,
        'Campaign_ROI': roi,
        'Revenue_Cost_ROI': revenueCostRoi,
        'Customer_Rating': i % 15 === 0 ? '' : rating
      });
    }

    const initialProfiles = profileDataset(data);
    const cleaned = cleanDataset(data, initialProfiles);
    const updatedProfiles = profileDataset(cleaned);

    // ── PII Shield on demo data ───────────────────────────────────────────────
    const demoShield = runPiiShield(cleaned);
    activePiiReport    = demoShield.piiReport;
    activeMappingTable = demoShield.mappingTable;
    const demoMasked   = demoShield.maskedData;
    // ─────────────────────────────────────────────────────────────────────────

    pipeline.setData(demoMasked);

    // Save to relational SQLite database (masked rows only)
    const dbDataset = await prisma.dataset.create({
      data: {
        fileName: 'Demo_Sales_Data_2026.csv',
        rowCount: demoMasked.length
      }
    });

    await prisma.dataRow.createMany({
      data: demoMasked.map((row: any, idx: number) => ({
        datasetId: dbDataset.id,
        rowIndex: idx,
        dataJson: JSON.stringify(row)
      }))
    });

    const analytics = runAnalyticsProfiling(demoMasked);
    if (analytics.anomalies.length > 0) {
      await prisma.anomaly.createMany({
        data: analytics.anomalies.map((anom: any) => ({
          datasetId: dbDataset.id,
          columnName: anom.columnName,
          rowIndex: anom.rowIndex,
          value: anom.value,
          mean: anom.mean,
          stdDev: anom.stdDev,
          zScore: anom.zScore,
          details: anom.details
        }))
      });
    }

    res.json({
      success: true,
      fileName: 'Demo_Sales_Data_2026.csv',
      dataLength: demoMasked.length,
      profiles: updatedProfiles,
      data: demoMasked,
      piiReport: activePiiReport
    });
  } catch (error: any) {
    console.error("Demo load error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Run Indexer
app.post('/api/index', async (req, res) => {
  try {
    const key = getGeminiKey(req);
    pipeline.setApiKey(key);
    
    let progressLog = '';
    const success = await pipeline.indexData((msg) => {
      progressLog = msg;
    });

    res.json({
      success,
      status: progressLog,
      isIndexed: pipeline.isIndexed
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Schema layout
app.get('/api/schema', (req, res) => {
  try {
    if (pipeline.data.length === 0) {
      return res.json({ dataLength: 0, profiles: [], data: [] });
    }
    const profiles = profileDataset(pipeline.data);
    res.json({
      dataLength: pipeline.data.length,
      profiles,
      data: pipeline.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Advanced Analytics (Z-scores, MoM growth, rolling averages, Autoencoder)
app.get('/api/analytics', async (req, res) => {
  try {
    if (pipeline.data.length === 0) {
      return res.json({ anomalies: [], momGrowth: [], rollingAverage: [] });
    }
    const analytics = await runFullAnalytics(pipeline.data);
    res.json(analytics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Chat AI Queries
app.post('/api/query', async (req, res) => {
  try {
    const { query, engine } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const gemKey = getGeminiKey(req);
    const groKey = getGrokKey(req);

    pipeline.setApiKey(gemKey);
    pipeline.setGrokApiKey(groKey);

    let activeSteps: QueryStep[] = [];
    const result = await pipeline.query(query, (steps) => {
      activeSteps = steps;
    }, engine || 'gemini');

    // Prisma DB Log chat query history
    await prisma.chatHistory.create({
      data: {
        sender: 'user',
        text: query
      }
    });

    await prisma.chatHistory.create({
      data: {
        sender: 'ai',
        text: result.answer,
        stepsJson: JSON.stringify(result.steps),
        chartJson: result.chartConfig ? JSON.stringify(result.chartConfig) : null
      }
    });

    // ── Unmask LLM answer tokens before sending to UI ────────────────────────
    const unmaskedAnswer = unmaskText(result.answer || '', activeMappingTable);
    // ─────────────────────────────────────────────────────────────────────────

    res.json({
      ...result,
      answer: unmaskedAnswer,
      steps: activeSteps
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Strategic Recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    const gemKey = getGeminiKey(req);
    const groKey = getGrokKey(req);
    const engine = (req.query.engine as 'gemini' | 'grok') || 'gemini';

    pipeline.setApiKey(gemKey);
    pipeline.setGrokApiKey(groKey);

    const recs = await pipeline.generateRecommendations(engine);
    res.json(recs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PII Security Status
app.get('/api/security-status', (_req, res) => {
  res.json({
    shieldActive: true,
    hasPii: activePiiReport?.hasPii ?? false,
    piiReport: activePiiReport,
    mappingTableSize: activeMappingTable.size,
    note: 'Mapping table lives only in server heap memory — never written to disk.'
  });
});

// Inspector chunks
app.get('/api/chunks', (req, res) => {
  try {
    res.json({
      chunks: pipeline.chunks,
      isIndexed: pipeline.isIndexed
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Data Verification Endpoint
// POST /api/verify { filterCol, filterVal, sumCol }
// Returns exact server-side sum so the client can confirm its own aggregation.
app.post('/api/verify', (req, res) => {
  try {
    const { filterCol, filterVal, sumCol } = req.body as {
      filterCol?: string;
      filterVal?: string;
      sumCol: string;
    };

    const data = pipeline.data as any[];
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'No dataset loaded on the server.' });
    }

    // Apply optional filter
    const filtered = filterCol && filterVal
      ? data.filter(row => String(row[filterCol]) === filterVal)
      : data;

    if (filtered.length === 0) {
      return res.json({
        filterCol, filterVal, sumCol,
        matchedRows: 0,
        serverSum: 0,
        note: 'No rows matched the specified filter.'
      });
    }

    // Compute exact sum of sumCol
    const serverSum = filtered.reduce((acc, row) => {
      const v = parseFloat(String(row[sumCol] ?? '').replace(/[^0-9.\-]/g, ''));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);

    // Compute average
    const serverAvg = serverSum / filtered.length;

    // Per-group breakdown
    const breakdown: Record<string, number> = {};
    filtered.forEach(row => {
      const v = parseFloat(String(row[sumCol] ?? '').replace(/[^0-9.\-]/g, ''));
      if (!isNaN(v)) breakdown[String(row[filterCol ?? sumCol] ?? 'all')] = (breakdown[String(row[filterCol ?? sumCol] ?? 'all')] || 0) + v;
    });

    res.json({
      filterCol: filterCol || null,
      filterVal: filterVal || null,
      sumCol,
      totalRows: data.length,
      matchedRows: filtered.length,
      serverSum: parseFloat(serverSum.toFixed(4)),
      serverAvg: parseFloat(serverAvg.toFixed(4)),
      breakdown
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start listening
app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(`Talking Rabbitt Server running on port ${PORT}`);
  console.log(`Gemini Key loaded: ${defaultGeminiKey ? 'YES' : 'NO'}`);
  console.log(`Grok Key loaded: ${defaultGrokKey ? 'YES' : 'NO'}`);
  console.log(`Prisma Client connected successfully to dev.db`);
  console.log(`===============================================`);
});
