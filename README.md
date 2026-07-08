# 🐰 Talking Rabbitt BI Platform

**Talking Rabbitt** is a next-generation AI-powered Business Intelligence (BI) and analytics platform. It combines agentic data cleaning, precise RAG-based query synthesis, local sandboxed code execution, and neural anomaly detection to help decision-makers interrogate and secure their business datasets.

---

## 🚀 Key Features

*   **🛡️ PII Security Shield**: Local regex-based scanner with session-scoped, in-memory tokenization. Real names, phone numbers, and emails are masked *before* leaving the server, ensuring zero-leak API queries.
*   **🧠 Pure RAG & Agentic Sandbox**: Coordinates semantic row retrieval (via vector indexing / similarity matching) with local Javascript execution inside a Node `vm` context, returning exact calculations with zero AI hallucinations.
*   **📈 Deep Neural Anomaly Detection**: A custom Dense Autoencoder built from scratch in pure TypeScript (with Adam backprop). Detects multivariate row outliers by computing neural reconstruction errors over numeric columns.
*   **🧬 Schematic Profiler**: A profile-driven column classifier that maps dataset fields (Sales, Volume, ROI, Date, Regions) using mathematical data shape properties and distributions instead of fragile keyword matching.
*   **📊 Strategic Multi-Agent synthesis**: Provides Root Cause Analysis (RCA) diagnostic graphs, rolling-period average timelines, and real-time boardroom debates (CFO, Growth, Risk perspectives) for budgeting queries.

---

## 💡 Our Approach

We reject the common, fragile design patterns of general-purpose AI interfaces (like simple keyword searching or text-only arithmetic synthesis) and instead construct our system upon four core architectural pillars:

### 1. Zero-Leak PII Security (Shield First)
Instead of relying on remote filters or compliance promises, we implement a **local PII Security Shield** directly in the backend. When a dataset is uploaded, it undergoes a regex-based scan for sensitive attributes (emails, phone numbers, customer names). Any detected PII is tokenized (`EMAIL_XXXXX`) and stored exclusively in server heap memory. The original mapping table never writes to disk. Original values are restored (`unmaskText()`) server-side right before presenting responses to authorized UI clients.

### 2. Sandbox Code Aggregation (Hybrid RAG)
Traditional RAG models struggle with numeric metrics and hallucinations. Our approach separates text retrieval from computation:
- **Retrieval**: Fetches relevant semantic rows (via vector search or local similarity models).
- **Execution**: The LLM acts as an **Agentic Code Generator**, compiling a read-only JavaScript aggregation function. This function runs on the server inside a secure, isolated `vm` sandbox context, processing the complete dataset.
- **Synthesis**: The exact computational output from the sandbox is fed back to the LLM to write the final executive summary. This guarantees **100% mathematical correctness**.

### 3. Lightweight Neural Architectures
To perform multivariate anomaly detection without dragging in heavy Python dependencies or native C-bindings (like TensorFlow native libraries), we built a **Pure TypeScript Dense Autoencoder** from scratch. By implementing feedforward layers, ReLU/Sigmoid activations, backpropagation, and the Adam Optimizer natively, we train a custom bottleneck model directly in the Node.js runtime process. Anomaly scores are derived from multi-dimensional reconstruction errors, enabling the system to discover correlations and anomalies that simple Z-score limits miss.

### 4. Schematic Profiling
Rather than mapping dataset schemas using keyword string checks (e.g. `col.name.includes("sales")`), we analyze the **data's shape and characteristics**. The schematic profiler evaluates integer ratios, date formats, null distributions, cardinality, and mean magnitudes. This allows Talking Rabbitt to build dashboard charts correctly regardless of header languages or naming conventions (e.g. column names like `X1` or `col_0` are parsed correctly).

---

## ⚠️ Challenges & Solutions

During development, we navigated several core integration hurdles and adapted our design patterns accordingly:

1. **Deprecated LLM Identifiers (`Model Not Found: grok-2`)**
   - *Challenge*: The xAI API returned `400 Bad Request` because the model identifier `grok-2` had been deprecated from their gateway.
   - *Solution*: Programmatically queried the xAI models registry to identify valid endpoints and updated the pipeline to use the stable alias `grok-latest` (routing dynamically to `grok-4.3`), ensuring future-proof API connectivity.
2. **Native Compilation Errors on TensorFlow.js (`tfjs-node`)**
   - *Challenge*: Attempting to install the native TensorFlow node bindings failed because the host environment lacked the compatible python/C++ compiler toolchain required for native build steps.
   - *Solution*: Rejected external frameworks entirely and implemented a **Pure TypeScript Dense Autoencoder** from scratch. Natively scripting feedforward layers, backpropagation, and SGD/Adam updates in pure JS loop blocks bypasses native compilation errors while maintaining robust multivariate anomaly detection.
3. **Session Persistence Overkill**
   - *Challenge*: The web app cached the active database state, causing it to auto-reload the last uploaded dataset on tab refresh or new session launches when a clean workspace was expected.
   - *Solution*: Disabled the automatic REST API restore hooks in `App.tsx` on mount, forcing the client state to default to a clean Ingestion dashboard on launch.
4. **Credential Leakage in Git History (GitHub Push Protection)**
   - *Challenge*: Committing the `.env` secret file locally blocked pushes to origin due to GitHub's push protection flagging raw API keys.
   - *Solution*: Removed local database files and caches from Git tracking, added database files to `.gitignore`, rewrote the local git history as a clean orphan branch with a single initial commit containing no secrets, and successfully pushed the clean history.

---

## 🛠️ Technology Stack

*   **Frontend**: React (Vite), TypeScript, Lucide Icons, Recharts (Responsive layout)
*   **Backend**: Node.js, Express, TypeScript
*   **Database & Indexing**: SQLite (Prisma ORM), ChromaDB / Local Cosine Vector Store
*   **AI Models**: Google Gemini (`gemini-2.5-flash`, `text-embedding-004`), xAI Grok (`grok-latest`)

---

## 🚀 Getting Started

### 1. Configure Keys
Create a `.env` file in the root directory:
```env
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-gemini-key"
GROK_API_KEY="your-grok-key"
```

### 2. Launch Development Servers
Install dependencies and run:
```bash
npm install
npm run dev
```
The app will serve the client at `http://localhost:5173` and proxy API calls to the server at port `5000`.
