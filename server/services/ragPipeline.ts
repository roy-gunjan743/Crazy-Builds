import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChromaClient, Collection } from 'chromadb';

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

const DATA_DIR = path.join(process.cwd(), 'server/data');
const DATASET_PATH = path.join(DATA_DIR, 'dataset.json');
const VECTORS_PATH = path.join(DATA_DIR, 'vectors.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function keywordSearch(chunks: DataChunk[], query: string, topK: number = 5): DataChunk[] {
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map(chunk => {
    const text = chunk.text.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (text.includes(word)) {
        score += 1;
      }
    }
    return { chunk, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.chunk)
    .slice(0, topK);
}

export function executeCodeSandbox(code: string, data: any[]): any {
  try {
    let cleanCode = code.trim();

    if (cleanCode.startsWith('```')) {
      const lines = cleanCode.split('\n');
      const start = lines[0].includes('javascript') || lines[0].includes('js') ? 1 : 0;
      const end = lines.lastIndexOf('```');
      cleanCode = lines.slice(start, end).join('\n');
    }

    const sandbox = {
      dataset: JSON.parse(JSON.stringify(data)),
      result: null,
    };

    const context = vm.createContext(sandbox);
    const scriptText = `
      const userFn = (${cleanCode});
      if (typeof userFn !== 'function') {
        throw new Error("Aggregator script must evaluate to a function");
      }
      result = userFn(dataset);
    `;

    const script = new vm.Script(scriptText);
    script.runInContext(context, { timeout: 1000 });

    return sandbox.result;
  } catch (error: any) {
    return 'Sandbox execution error: ' + error.message;
  }
}

export function createDataChunks(data: any[], maxChunks: number = 100): DataChunk[] {
  if (!data || data.length === 0) return [];

  const keys = Object.keys(data[0]);
  const totalRows = data.length;
  const rowsPerChunk = Math.max(1, Math.ceil(totalRows / maxChunks));
  const chunks: DataChunk[] = [];

  for (let i = 0; i < totalRows; i += rowsPerChunk) {
    const end = Math.min(i + rowsPerChunk, totalRows);
    const slice = data.slice(i, end);

    let chunkText = `Records indices ${i} to ${end - 1} of the dataset:\n`;
    slice.forEach((row, subIndex) => {
      const rowNum = i + subIndex;
      const rowDesc = keys.map(k => `${k}: ${row[k]}`).join(', ');
      chunkText += `- Row ${rowNum}: ${rowDesc}\n`;
    });

    chunks.push({
      id: `chunk_${i}_${end}`,
      text: chunkText,
      rowIndexStart: i,
      rowIndexEnd: end - 1
    });
  }

  return chunks;
}

async function callGrokAPI(prompt: string, grokApiKey: string): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${grokApiKey}`
    },
    body: JSON.stringify({
      model: 'grok-latest',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Grok API Error (${response.status}): ${errText}`);
  }

  const json: any = await response.json();
  return json.choices[0]?.message?.content || '';
}

export class BackendRagPipeline {
  private apiKey: string = '';
  private grokApiKey: string = '';
  public data: any[] = [];
  public chunks: DataChunk[] = [];
  public isIndexed: boolean = false;

  private chromaCollection: Collection | null = null;
  private chromaClient: ChromaClient | null = null;

  constructor(apiKey: string, grokApiKey?: string) {
    this.apiKey = apiKey;
    this.grokApiKey = grokApiKey || '';
    this.loadState();
    this.initChroma();
  }

  public setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  public setGrokApiKey(grokApiKey: string) {
    this.grokApiKey = grokApiKey;
  }

  public setData(data: any[]) {
    this.data = data;
    this.chunks = createDataChunks(data);
    this.isIndexed = false;
    this.saveState();
  }

  private async initChroma() {
    try {
      const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
      this.chromaClient = new ChromaClient({ path: chromaUrl });
      await this.chromaClient.version();
      this.chromaCollection = await this.chromaClient.getOrCreateCollection({
        name: "talking_rabbitt_chunks"
      });
      console.log(`[Chroma DB] Successfully connected to instance at ${chromaUrl}`);
    } catch (e) {
      console.log("[Chroma DB] Daemon offline or unreachable. falling back to in-memory cosine indices.");
      this.chromaCollection = null;
      this.chromaClient = null;
    }
  }

  private saveState() {
    try {
      fs.writeFileSync(DATASET_PATH, JSON.stringify(this.data, null, 2));
      fs.writeFileSync(VECTORS_PATH, JSON.stringify({
        isIndexed: this.isIndexed,
        chunks: this.chunks
      }, null, 2));
    } catch (e) {
      console.error("Failed to save state to disk:", e);
    }
  }

  private loadState() {
    try {
      if (fs.existsSync(DATASET_PATH)) {
        this.data = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
      }
      if (fs.existsSync(VECTORS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
        this.isIndexed = parsed.isIndexed || false;
        this.chunks = parsed.chunks || [];
      }
    } catch (e) {
      console.error("Failed to load state from disk:", e);
    }
  }

  public async indexData(onProgress: (msg: string) => void): Promise<boolean> {
    if (!this.apiKey) {
      onProgress('ERROR: No Gemini API key configured. Vector indexing requires a valid API key. Please add your key in Settings.');
      return false;
    }

    if (this.chunks.length === 0) {
      onProgress("Index is empty.");
      return false;
    }

    try {
      onProgress(`Generating embeddings for ${this.chunks.length} chunks...`);
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

      const textToEmbed = this.chunks.map(c => c.text);
      const batchSize = 30;

      for (let i = 0; i < textToEmbed.length; i += batchSize) {
        const slice = textToEmbed.slice(i, i + batchSize);
        onProgress(`Processing embeddings batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(textToEmbed.length / batchSize)}...`);

        const response = await model.batchEmbedContents({
          requests: slice.map(text => ({
            content: { role: 'user', parts: [{ text }] }
          }))
        });

        const embeddings = response.embeddings;

        for (let j = 0; j < slice.length; j++) {
          const idx = i + j;
          if (embeddings[j] && embeddings[j].values) {
            this.chunks[idx].embedding = embeddings[j].values;
          }
        }
      }

      if (this.chromaCollection) {
        onProgress("Saving chunks and vector coordinates into Chroma DB collection...");
        try {
          await this.chromaClient!.deleteCollection({ name: "talking_rabbitt_chunks" });
          this.chromaCollection = await this.chromaClient!.getOrCreateCollection({
            name: "talking_rabbitt_chunks"
          });

          await this.chromaCollection.add({
            ids: this.chunks.map(c => c.id),
            embeddings: this.chunks.map(c => c.embedding!),
            documents: this.chunks.map(c => c.text),
            metadatas: this.chunks.map(c => ({
              rowIndexStart: c.rowIndexStart,
              rowIndexEnd: c.rowIndexEnd
            }))
          });
          onProgress("Successfully synchronized index inside Chroma DB.");
        } catch (chromaErr: any) {
          console.error("Chroma DB sync error:", chromaErr.message);
          onProgress(`Chroma DB sync failed: ${chromaErr.message}. Local fallback index remains active.`);
        }
      }

      this.isIndexed = true;
      onProgress("Indexing complete.");
      this.saveState();
      return true;
    } catch (error: any) {
      onProgress(`Embedding creation failed: ${error.message}`);
      // Do NOT mark isIndexed = true on failure — the index is corrupt or incomplete.
      this.isIndexed = false;
      this.saveState();
      return false;
    }
  }

  public async query(
    userQuery: string,
    stepsCallback: (steps: QueryStep[]) => void,
    engine: 'gemini' | 'grok' = 'gemini'
  ): Promise<RagResult> {
    const steps: QueryStep[] = [
      { name: 'Semantic Data Retrieval', status: 'pending' },
      { name: 'Agentic Code Generation', status: 'pending' },
      { name: 'Local Sandbox Aggregation', status: 'pending' },
      { name: 'Response Synthesis', status: 'pending' }
    ];
    stepsCallback([...steps]);

    let retrieved: DataChunk[] = [];
    const activeKey = engine === 'grok' ? this.grokApiKey : this.apiKey;

    // Step 1: Retrieval
    try {
      if (this.apiKey && this.isIndexed && this.chunks.some(c => c.embedding)) {
        steps[0].detail = "Requesting query embeddings vector...";
        stepsCallback([...steps]);

        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

        const queryEmbResponse = await model.embedContent(userQuery);
        const queryEmbedding = queryEmbResponse.embedding?.values;

        if (queryEmbedding) {
          if (this.chromaCollection) {
            steps[0].detail = "Retrieving matching rows from Chroma DB vector collection...";
            stepsCallback([...steps]);

            const queryResults = await this.chromaCollection.query({
              queryEmbeddings: [queryEmbedding],
              nResults: 5
            });

            if (queryResults && queryResults.documents && queryResults.documents[0]) {
              const documents = queryResults.documents[0];
              const ids = queryResults.ids[0];
              const metadatas = queryResults.metadatas[0] as any[];

              retrieved = documents.map((doc, idx) => ({
                id: ids[idx],
                text: doc || '',
                rowIndexStart: metadatas[idx]?.rowIndexStart || 0,
                rowIndexEnd: metadatas[idx]?.rowIndexEnd || 0
              }));

              steps[0].status = 'success';
              steps[0].detail = `Retrieved ${retrieved.length} chunks from Chroma DB.`;
            } else {
              throw new Error("Empty query results from Chroma");
            }
          } else {
            steps[0].detail = "Chroma DB offline. Retrieving via local cosine similarity matcher...";
            stepsCallback([...steps]);

            const scored = this.chunks
              .filter(c => c.embedding)
              .map(c => ({
                chunk: c,
                sim: cosineSimilarity(queryEmbedding, c.embedding!)
              }))
              .sort((a, b) => b.sim - a.sim);

            retrieved = scored.slice(0, 5).map(item => item.chunk);
            steps[0].status = 'success';
            steps[0].detail = `Retrieved ${retrieved.length} chunks locally. Best match: ${(scored[0]?.sim * 100 || 0).toFixed(1)}%`;
          }
        } else {
          throw new Error("Failed to get query embedding");
        }
      } else {
        // No Gemini key or no embeddings indexed — keyword retrieval is NOT a substitute.
        // Surface a real retrieval using keyword matching only as an honest search strategy.
        if (this.chunks.length === 0) {
          throw new Error('No data indexed. Upload and index a dataset before querying.');
        }
        steps[0].detail = 'No vector embeddings — performing keyword retrieval on indexed chunks...';
        stepsCallback([...steps]);
        retrieved = keywordSearch(this.chunks, userQuery, 5);
        if (retrieved.length === 0) {
          throw new Error('No relevant chunks found for this query in the indexed dataset.');
        }
        steps[0].status = 'success';
        steps[0].detail = `Keyword retrieval: ${retrieved.length} relevant chunks found.`;
      }
    } catch (e: any) {
      steps[0].status = 'failed';
      steps[0].detail = `Retrieval failed: ${e.message}`;
      stepsCallback([...steps]);
      // Pure RAG — do not silently fall back to keyword search.
      // Surface the real error so the user knows exactly what went wrong.
      return {
        answer: `❌ **Retrieval Failed**\n\n${e.message}\n\nEnsure your dataset is uploaded and indexed before querying.`,
        steps,
        retrievedChunks: []
      };
    }
    stepsCallback([...steps]);

    const schema = this.data.length > 0 ? Object.keys(this.data[0]).map(k => {
      const firstVal = this.data[0][k];
      return `${k} (${typeof firstVal})`;
    }).join(', ') : 'Empty schema';

    // Step 2 & 3: Code Gen and Sandbox Exec
    let sandboxResult: any = null;
    let generatedJsCode = '';

    if (activeKey) {
      try {
        steps[1].detail = `Requesting code generation from ${engine.toUpperCase()} engine...`;
        stepsCallback([...steps]);

        const codePrompt = `
You are an expert Data Analyst AI.
We have a dataset loaded in memory as an array of objects.
The keys in each object are: [${schema}].
Sample row: ${JSON.stringify(this.data[0] || {})}

Your task is to write a single read-only JavaScript arrow function that accepts the dataset (array of objects) and aggregates or filters the data to answer this question: "${userQuery}".

Guidelines:
1. Return ONLY a valid JS arrow function. Do not assign it to a variable. E.g. (data) => { ... return result; }
2. Do not use external APIs or require modules. Use simple loops, map, filter, reduce, or Math functions.
3. If the query asks for totals, averages, growth rate, maximums, campaigns ROI, or regional performance, calculate the exact metrics.
4. Keep the function robust. Check that fields exist. Handle cases where parsing might fail.
5. Do not include markdown wraps unless they are standard \`\`\`javascript ... \`\`\` block tags.
6. The output should be clean, readable code that returns either a number, string, array, or simple object.

Example for "average sales":
(data) => {
  const nums = data.map(d => parseFloat(String(d.Sales || d.sales || 0).replace(/[\\$,%]/g, ''))).filter(n => !isNaN(n));
  return nums.length ? parseFloat((nums.reduce((a,b)=>a+b,0) / nums.length).toFixed(2)) : 0;
}
`;

        if (engine === 'grok') {
          generatedJsCode = await callGrokAPI(codePrompt, this.grokApiKey);
        } else {
          const genAI = new GoogleGenerativeAI(this.apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const response = await model.generateContent(codePrompt);
          generatedJsCode = response.response.text() || '';
        }

        steps[1].code = generatedJsCode;
        steps[1].status = 'success';
        steps[1].detail = "JavaScript function successfully compiled.";
        stepsCallback([...steps]);

        // Step 3: Run Sandbox
        steps[2].detail = "Executing generated code in backend VM context...";
        stepsCallback([...steps]);

        sandboxResult = executeCodeSandbox(generatedJsCode, this.data);
        steps[2].result = sandboxResult;
        steps[2].status = 'success';
        steps[2].detail = `Execution completed. Sandbox returned: ${JSON.stringify(sandboxResult)}`;
      } catch (err: any) {
        steps[1].status = 'failed';
        steps[1].detail = `Code generation failed: ${err.message}`;
        steps[2].status = 'failed';
        steps[2].detail = 'Execution aborted.';
      }
    } else {
      // No API key — code interpretation is impossible. Mark steps as requiring configuration.
      steps[1].status = 'failed';
      steps[1].detail = `No ${engine.toUpperCase()} API key. Configure your key in Settings to enable the code interpreter.`;
      steps[2].status = 'failed';
      steps[2].detail = 'Code execution skipped — API key required.';
    }
    stepsCallback([...steps]);

    // Step 4: Response Synthesis
    let answer = '';
    let chartConfig: RagResult['chartConfig'] = undefined;
    let rcaGraph: RagResult['rcaGraph'] = undefined;
    let personas: RagResult['personas'] = undefined;

    try {
      steps[3].detail = `Synthesizing results using ${engine.toUpperCase()} model...`;
      stepsCallback([...steps]);

      const contextText = retrieved.map(c => c.text).join('\n---\n');
      const normQuery = userQuery.toLowerCase();
      const isBudgetQuery = normQuery.includes('budget') || normQuery.includes('cut') || normQuery.includes('spend') || normQuery.includes('allocate');

      // Hard gate — no key means no LLM synthesis, period.
      if (!activeKey) {
        throw new Error(
          `No ${engine.toUpperCase()} API key configured. ` +
          'Open Settings and paste your API key to enable AI-powered analysis.'
        );
      }

      const synthesisPrompt = `
You are the Talking Rabbitt AI Analytics Assistant. You are conversing with a business manager.
User Query: "${userQuery}"

Data Context:
- Dataset Schema: [${schema}]
- Total Records: ${this.data.length}
- Exact Analytical Summary (Computed from local sandbox): ${JSON.stringify(sandboxResult || 'N/A')}
- Retrieved semantic row excerpts:
${contextText.slice(0, 3000)}

Your job is to answer the query accurately using BOTH the exact aggregation results and the semantic row contexts.

${isBudgetQuery ? `
CRITICAL INSTRUCTION FOR BUDGET DECISION:
Since the user query is asking about budget cuts, campaign spends, or financial allocations, you MUST include a multi-agent boardroom debate in your JSON response.
You must generate three separate, highly specific perspectives grounded in the dataset:
1. "cfo" (The CFO - cost-focused): Suggest cost reductions, ROI comparisons, and budget reallocation to higher performing regions or channels. E.g. "Region X's ROI dropped 30%. Cut spend, reallocate to Region Y which is outperforming."
2. "growth" (The Growth Agent - opportunity-focused): Look for competition defensive drops, strategic counters, market shares, or branding value. E.g. "Region X's drop coincides with a competitor's ad blitz — this is a defensive dip, not a failure. Recommend holding budget."
3. "risk" (The Risk Agent - caution-focused): Raise issues about data quality (such as null/missing fields in columns), seasonal volatility, or systemic risks. E.g. "Note that Region X data has 15% missing entries this month — the drop may be partially a data quality issue."
` : ''}

If the user query is diagnostic (e.g., asking "why" sales/metrics dropped, fell, spiked, or changed), you MUST generate a Root Cause Analysis (RCA) diagnostic graph mapping the cause.
The graph should contain exactly 5 nodes tracing your investigation:
1. A region node (investigating geographic splits, e.g. "West fell 40%")
2. A product node (investigating product splits, e.g. "Product A drove the drop")
3. A campaign node (investigating marketing campaign correlation, e.g. "Campaign Y ended")
4. A seasonality node (which must have status set to "eliminated", representing a factor you investigated and ruled out, e.g. "Seasonality ruled out - typical cyclical patterns stable")
5. A synthesis node (type "synthesis", summarizing the root cause with a confidence score, e.g. "Sales dropped because Campaign Y ended, concentrated in Product A in Region X", confidence: 92)

You must reply in a clean, structured JSON format conforming to the schema below.
IMPORTANT: Your output MUST start with a curly brace \`{\` and end with a curly brace \`}\`. Do not write conversational text outside of the JSON block. Do not format it in markdown backticks. Return the JSON object directly.

JSON Format:
{
  "answer": "Write a professional, detailed, and highly strategic answer. Summarize the findings, highlight trends, explain the 'why' if possible based on row data, and suggest action items. Use markdown inside this string for formatting.",
  "chartConfig": {
    "type": "bar" | "line" | "pie" | "scatter" | "area",
    "title": "Descriptive chart title",
    "xAxisKey": "name",
    "yAxisKey": "value",
    "data": [
      {"name": "label", "value": 100}
    ]
  },
  "rcaGraph": [
    {
      "id": "region",
      "label": "Region Check",
      "value": "West fell 40%, others stable",
      "type": "region",
      "status": "active",
      "connections": [],
      "x": 10,
      "y": 15
    },
    ...
  ],
  "personas": { // Include ONLY if isBudgetQuery is true.
    "cfo": "CFO take here...",
    "growth": "Growth agent take here...",
    "risk": "Risk agent take here..."
  }
}
`;
      // ── Actual LLM call (Grok or Gemini) ───────────────────────────────────
      let responseText = '';
      if (engine === 'grok') {
        responseText = await callGrokAPI(synthesisPrompt, this.grokApiKey);
      } else {
        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const synthResponse = await model.generateContent(synthesisPrompt);
        responseText = synthResponse.response.text() || '';
      }
      // ── Extract JSON object from response (strip any markdown wrapper) ──────
      if (responseText.includes('{')) {
        const startIdx = responseText.indexOf('{');
        const endIdx = responseText.lastIndexOf('}') + 1;
        responseText = responseText.substring(startIdx, endIdx);
      }
      // ─────────────────────────────────────────────────────────────────────────

      try {
        const parsed = JSON.parse(responseText);
        answer = parsed.answer || responseText;
        chartConfig = parsed.chartConfig;
        rcaGraph = parsed.rcaGraph;
        personas = parsed.personas;
        steps[3].status = 'success';
        steps[3].detail = 'Synthesis complete.';
      } catch (jsonErr) {
        // LLM returned plain text (not JSON) — still valid, use it directly.
        answer = responseText;
        steps[3].status = 'success';
        steps[3].detail = 'Synthesis returned plain text (no JSON wrapper).';
      }

      stepsCallback([...steps]);

      return {
        answer,
        steps,
        chartConfig,
        retrievedChunks: retrieved,
        rcaGraph,
        personas
      };
    } catch (synthErr: any) {
      steps[3].status = 'failed';
      steps[3].detail = `Synthesis failed: ${synthErr.message}`;
      stepsCallback([...steps]);
      return {
        answer: `An error occurred during response synthesis: ${synthErr.message}`,
        steps,
        retrievedChunks: retrieved
      };
    }
  }

  public async generateRecommendations(engine: 'gemini' | 'grok' = 'gemini'): Promise<{
    title: string;
    description: string;
    impact: 'High' | 'Medium' | 'Low';
    effort: 'High' | 'Medium' | 'Low';
    actionSteps: string[];
  }[]> {
    const activeKey = engine === 'grok' ? this.grokApiKey : this.apiKey;

    if (!activeKey) {
      throw new Error(
        `No ${engine.toUpperCase()} API key configured. ` +
        'Open Settings and paste your API key to generate real AI recommendations.'
      );
    }

    if (this.data.length === 0) {
      throw new Error('No dataset loaded. Upload data first before generating recommendations.');
    }

    try {
      const schema = Object.keys(this.data[0]).join(', ');
      const subset = this.data.slice(0, 100);
      const prompt = `
You are a Principal Business Intelligence Consultant and Strategy Agent.
Here is the schema of our ingested business dataset: [${schema}]
Here is a sample subset of the first 100 rows in JSON:
${JSON.stringify(subset)}

Your job is to analyze this business context and suggest exactly 4 high-value strategic recommendations to improve performance, increase ROI, or fix operational anomalies.

You must reply in a clean, structured JSON format containing an array of recommendations.
IMPORTANT: Your output MUST start with a bracket \`[\` and end with a bracket \`]\`. Do not write conversational text outside of the JSON block. Do not format it in markdown backticks.

JSON Format:
[
  {
    "title": "Clear action-oriented title",
    "description": "Elaborated strategic context of why this is important and what problem it solves.",
    "impact": "High" | "Medium" | "Low",
    "effort": "High" | "Medium" | "Low",
    "actionSteps": [
      "Step 1: ...",
      "Step 2: ..."
    ]
  }
]
`;

      let text = '';
      if (engine === 'grok') {
        text = await callGrokAPI(prompt, this.grokApiKey);
      } else {
        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const response = await model.generateContent(prompt);
        text = response.response.text() || '';
      }

      if (text.includes('[')) {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']') + 1;
        text = text.substring(start, end);
      }

      return JSON.parse(text);
    } catch (e: any) {
      // Re-throw so the Express route returns a real 500 error to the frontend.
      throw new Error(`Recommendations generation failed: ${e.message}`);
    }
  }
}
