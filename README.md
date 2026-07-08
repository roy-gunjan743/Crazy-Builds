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
