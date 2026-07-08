import { useState } from 'react';
import { Upload, FileText, CheckCircle2, RefreshCw, Layers, Shield, ShieldAlert, ShieldCheck, Lock, Eye, EyeOff, AlertTriangle, Info } from 'lucide-react';
import type { ColumnProfile } from '../services/dataCleaner';

interface PiiColumnFlag {
  columnName: string;
  piiType: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  detectionMethod: string;
  sampleMatchCount: number;
  totalRows: number;
  tokenPrefix: string;
}

interface PiiReport {
  scannedAt: string;
  totalColumns: number;
  flaggedColumns: PiiColumnFlag[];
  hasPii: boolean;
  riskSummary: { critical: number; high: number; medium: number; low: number };
}

interface DataIngestionProps {
  onDataLoaded: (data: any[], profiles: ColumnProfile[]) => void;
  currentDatasetLength: number;
  profiles: ColumnProfile[];
}

const RISK_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};

const RISK_BG: Record<string, string> = {
  critical: 'rgba(239,68,68,0.1)',
  high:     'rgba(249,115,22,0.1)',
  medium:   'rgba(234,179,8,0.1)',
  low:      'rgba(34,197,94,0.1)',
};

export const DataIngestion: React.FC<DataIngestionProps> = ({ 
  onDataLoaded, 
  currentDatasetLength,
  profiles 
}) => {
  const [dragActive, setDragActive]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [fileName, setFileName]       = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [piiReport, setPiiReport]     = useState<PiiReport | null>(null);
  const [showTokenMap, setShowTokenMap] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setErrorMsg('');
    setPiiReport(null);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      setErrorMsg('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to upload dataset.');
      }
      const result = await res.json();
      setFileName(result.fileName);
      if (result.piiReport) setPiiReport(result.piiReport);
      onDataLoaded(result.data, result.profiles);
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error occurred during parsing.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = async () => {
    setLoading(true);
    setErrorMsg('');
    setPiiReport(null);

    try {
      const res = await fetch('/api/upload-demo', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to load mock dataset from server.');
      const result = await res.json();
      setFileName(result.fileName);
      if (result.piiReport) setPiiReport(result.piiReport);
      onDataLoaded(result.data, result.profiles);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load demo dataset.');
    } finally {
      setLoading(false);
    }
  };

  const riskIcon = (risk: string) => {
    if (risk === 'critical') return <ShieldAlert size={13} style={{ color: RISK_COLOR.critical }} />;
    if (risk === 'high') return <AlertTriangle size={13} style={{ color: RISK_COLOR.high }} />;
    return <Info size={13} style={{ color: RISK_COLOR[risk] || '#94a3b8' }} />;
  };

  return (
    <div className="ingest-grid">
      {/* ── Left: File Dropzone ─────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Data Ingestion Agent</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Upload your raw business data sheet to start. Talking Rabbitt backend automatically profiles
          categories, identifies types, structures records, and establishes vector indexing.
        </p>

        {/* PII Shield Notice — always visible */}
        <div className="pii-shield-badge">
          <Shield size={15} className="pii-shield-icon" />
          <span><strong>PII Shield Active</strong> — Raw data never written to disk. All emails, names & phone numbers are tokenized server-side before any LLM call.</span>
        </div>

        <form
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onSubmit={(e) => e.preventDefault()}
          style={{ width: '100%' }}
        >
          <input type="file" id="file-upload" className="hidden-file-input" style={{ display: 'none' }}
            onChange={handleChange} accept=".csv, .xlsx, .xls" />
          <label htmlFor="file-upload" className={`dropzone-container ${dragActive ? 'dragging' : ''}`}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--primary)' }} />
                <p className="dropzone-title">Processing Dataset…</p>
                <p className="dropzone-sub">Scanning PII, masking tokens, parsing…</p>
              </div>
            ) : (
              <>
                <Upload size={40} style={{ color: 'var(--text-muted)' }} />
                <p className="dropzone-title">Drag &amp; drop your files here</p>
                <p className="dropzone-sub">Supports CSV, XLS, XLSX formats</p>
                <span className="button secondary-btn">Browse Files</span>
              </>
            )}
          </label>
        </form>

        {errorMsg && (
          <div style={{ color: 'var(--error)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.08)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--panel-border)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--panel-border)' }} />
        </div>

        <button onClick={loadSample} className="button" style={{ justifyContent: 'center' }} disabled={loading}>
          <Layers size={18} /> Load Demo Business Dataset
        </button>

        {/* ── PII Scan Console (shown after upload) ──────────────────────── */}
        {piiReport && (
          <div className="pii-console">
            <div className="pii-console-header">
              {piiReport.hasPii
                ? <ShieldAlert size={16} style={{ color: '#f97316' }} />
                : <ShieldCheck size={16} style={{ color: '#22c55e' }} />}
              <span>PII Scanner Report</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                {new Date(piiReport.scannedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Risk summary pills */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {(['critical', 'high', 'medium', 'low'] as const).map(r => (
                piiReport.riskSummary[r] > 0 && (
                  <span key={r} className="pii-risk-pill" style={{ background: RISK_BG[r], color: RISK_COLOR[r], borderColor: RISK_COLOR[r] }}>
                    {riskIcon(r)} {piiReport.riskSummary[r]} {r}
                  </span>
                )
              ))}
              {!piiReport.hasPii && (
                <span className="pii-risk-pill" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: '#22c55e' }}>
                  <ShieldCheck size={12} /> No PII detected
                </span>
              )}
            </div>

            {/* Flagged columns list */}
            {piiReport.flaggedColumns.length > 0 && (
              <div className="pii-flagged-list">
                {piiReport.flaggedColumns.map((flag, i) => (
                  <div key={i} className="pii-flagged-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                      {riskIcon(flag.risk)}
                      <code style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>{flag.columnName}</code>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>
                        ({flag.piiType})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        → <code style={{ color: 'var(--secondary)' }}>{flag.tokenPrefix}_XXXXX</code>
                      </span>
                      <span className="pii-risk-pill" style={{ background: RISK_BG[flag.risk], color: RISK_COLOR[flag.risk], borderColor: RISK_COLOR[flag.risk], fontSize: '0.65rem', padding: '0 0.35rem' }}>
                        {flag.risk}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* "Data never written to disk" indicator */}
            <div className="pii-disk-safe-indicator">
              <Lock size={12} />
              <span>Raw PII discarded in-memory after tokenization &mdash; mapping table <strong>never</strong> written to disk or sent to LLM</span>
            </div>

            {/* Token map toggle */}
            <button
              className="button secondary-btn"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem', height: 'auto', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() => setShowTokenMap(v => !v)}
            >
              {showTokenMap ? <EyeOff size={12} /> : <Eye size={12} />}
              {showTokenMap ? 'Hide' : 'View'} Token Mapping Pipeline
            </button>

            {showTokenMap && (
              <div className="pii-pipeline-steps">
                {['File read into server memory', 'PII Scanner agent runs regex rules', 'Masking agent replaces values with tokens', 'Aggregated data cube generated from masked rows', 'LLM receives only cubed numbers — zero raw PII', 'Unmask renderer resolves tokens locally for display', 'Session end → mapping table purged from heap'].map((step, i) => (
                  <div key={i} className="pii-pipeline-step">
                    <div className="pii-step-number">{i + 1}</div>
                    <span style={{ fontSize: '0.78rem' }}>{step}</span>
                    {i < 2 && <span className="pii-step-badge local">Local</span>}
                    {i === 3 && <span className="pii-step-badge clean">PII-Free</span>}
                    {i === 4 && <span className="pii-step-badge safe">No PII sent</span>}
                    {i === 5 && <span className="pii-step-badge local">Local</span>}
                    {i === 6 && <span className="pii-step-badge purge">Purged</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Schema & Analysis ────────────────────────────────────────── */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Data Schema &amp; Analysis</h2>
          {currentDatasetLength > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <CheckCircle2 size={16} /> {currentDatasetLength} Records Cleaned
            </div>
          )}
        </div>

        {currentDatasetLength === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', minHeight: '300px' }}>
            <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>
              No active dataset loaded. Upload a CSV/Excel file or launch the Demo dataset to review schema details.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Source File Name:</span>
                <span style={{ fontWeight: 600 }}>{fileName || 'active_dataset.json'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Columns Analyzed:</span>
                <span style={{ fontWeight: 600 }}>{profiles.length}</span>
              </div>
            </div>

            {/* PII shield inline summary on schema side */}
            {piiReport && piiReport.hasPii && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: '1rem', fontSize: '0.8rem', color: '#f97316' }}>
                <ShieldAlert size={14} />
                {piiReport.flaggedColumns.length} PII column{piiReport.flaggedColumns.length > 1 ? 's' : ''} masked before storage
              </div>
            )}
            {piiReport && !piiReport.hasPii && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: '1rem', fontSize: '0.8rem', color: '#22c55e' }}>
                <ShieldCheck size={14} /> No PII detected — data stored as-is
              </div>
            )}

            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
              Detected Fields
            </h3>

            <div className="schema-list">
              {profiles.map((profile, i) => {
                const flagged = piiReport?.flaggedColumns.find(f => f.columnName === profile.name);
                return (
                  <div key={i} className="schema-item" style={flagged ? { borderLeft: `3px solid ${RISK_COLOR[flagged.risk]}`, paddingLeft: '0.5rem' } : {}}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {profile.name}
                        {flagged && (
                          <span style={{ fontSize: '0.65rem', background: RISK_BG[flagged.risk], color: RISK_COLOR[flagged.risk], border: `1px solid ${RISK_COLOR[flagged.risk]}`, padding: '0 0.35rem', borderRadius: '4px' }}>
                            🔒 {flagged.tokenPrefix}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {profile.uniqueCount} unique values • {profile.missingCount > 0 ? `${profile.missingCount} missing values fixed` : 'No missing values'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                      <span className={`badge ${profile.type}`}>{profile.type}</span>
                      {profile.type === 'numeric' && profile.mean !== undefined && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Avg: {profile.mean}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
