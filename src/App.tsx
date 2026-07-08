import { useState, useEffect } from 'react';
import { 
  UploadCloud, BarChart3, MessageSquare, Lightbulb, Database, Settings, Rabbit, X, Check, Info, Cpu, Compass 
} from 'lucide-react';
import { DataIngestion } from './components/DataIngestion';
import { Dashboard } from './components/Dashboard';
import { ChatAssistant } from './components/ChatAssistant';
import { Recommendations } from './components/Recommendations';
import { RagVisualizer } from './components/RagVisualizer';
import { MetabaseWorkspace } from './components/MetabaseWorkspace';
import type { ColumnProfile } from './services/dataCleaner';

export default function App() {
  // Application State
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [grokApiKey, setGrokApiKey] = useState<string>(() => localStorage.getItem('grok_api_key') || '');
  const [metabaseEmbedUrl, setMetabaseEmbedUrl] = useState<string>(() => localStorage.getItem('metabase_embed_url') || '');
  const [activeEngine, setActiveEngine] = useState<'gemini' | 'grok'>('gemini');
  
  const [dataset, setDataset] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<ColumnProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'ingest' | 'dashboard' | 'chat' | 'recommendations' | 'rag' | 'metabase'>('ingest');
  const [isIndexed, setIsIndexed] = useState<boolean>(false);
  const [indexingStatus, setIndexingStatus] = useState<string>('');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>('');
  const [tempGrokApiKey, setTempGrokApiKey] = useState<string>('');
  const [tempMetabaseEmbedUrl, setTempMetabaseEmbedUrl] = useState<string>('');

  // Startup starts clean — no auto-restoring previous session datasets on page load.

  const handleDataLoaded = (data: any[], colProfiles: ColumnProfile[]) => {
    setDataset(data);
    setProfiles(colProfiles);
    setIsIndexed(false);
    setIndexingStatus('');
    setActiveTab('dashboard');
  };

  const handleIndexData = async () => {
    if (dataset.length === 0) return;
    setIndexingStatus('Initializing vector database indexes...');
    setIsIndexed(false);
    
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey
        }
      });
      
      const result = await res.json();
      setIsIndexed(result.isIndexed);
      setIndexingStatus(result.status || (result.success ? 'Indexing complete.' : 'Indexing failed.'));
    } catch (e: any) {
      setIndexingStatus(`Indexing failed: ${e.message}`);
      setIsIndexed(false);
    }
  };

  useEffect(() => {
    if (dataset.length > 0) {
      handleIndexData();
    }
  }, [dataset, apiKey]);

  const openSettings = () => {
    setTempApiKey(apiKey);
    setTempGrokApiKey(grokApiKey);
    setTempMetabaseEmbedUrl(metabaseEmbedUrl);
    setIsSettingsOpen(true);
  };

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', tempApiKey.trim());
    localStorage.setItem('grok_api_key', tempGrokApiKey.trim());
    localStorage.setItem('metabase_embed_url', tempMetabaseEmbedUrl.trim());
    setApiKey(tempApiKey.trim());
    setGrokApiKey(tempGrokApiKey.trim());
    setMetabaseEmbedUrl(tempMetabaseEmbedUrl.trim());
    setIsSettingsOpen(false);
  };

  const hasCredentials = !!apiKey || !!grokApiKey;

  return (
    <div className="app-container">
      {/* Navbar */}
      <header className="navbar">
        <div className="logo-section">
          <Rabbit className="logo-icon" size={28} />
          <span className="logo-text">Talking Rabbitt</span>
          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>v3.0</span>
        </div>

        {/* Tab Routing */}
        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'ingest' ? 'active' : ''}`}
            onClick={() => setActiveTab('ingest')}
          >
            <UploadCloud size={16} />
            Upload Data
          </button>
          <button 
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={16} />
            Dashboard
          </button>
          <button 
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={16} />
            AI Chat
          </button>
          <button 
            className={`nav-tab ${activeTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
          >
            <Lightbulb size={16} />
            Recommendations
          </button>
          <button 
            className={`nav-tab ${activeTab === 'rag' ? 'active' : ''}`}
            onClick={() => setActiveTab('rag')}
          >
            <Database size={16} />
            RAG
          </button>
          <button 
            className={`nav-tab ${activeTab === 'metabase' ? 'active' : ''}`}
            onClick={() => setActiveTab('metabase')}
            style={{ borderLeft: '1px solid var(--panel-border)', paddingLeft: '1rem', color: activeTab === 'metabase' ? '#509ee3' : 'var(--text-muted)' }}
          >
            <Compass size={16} style={{ color: activeTab === 'metabase' ? '#509ee3' : 'inherit' }} />
            Metabase Portal
          </button>
        </nav>

        {/* Action Widgets */}
        <div className="navbar-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', padding: '0.25rem 0.75rem', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
            <Cpu size={14} style={{ color: activeEngine === 'grok' ? 'var(--secondary)' : 'var(--primary)' }} />
            <select 
              value={activeEngine}
              onChange={(e) => setActiveEngine(e.target.value as 'gemini' | 'grok')}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value="gemini" style={{ background: '#111827', color: '#fff' }}>Google Gemini</option>
              <option value="grok" style={{ background: '#111827', color: '#fff' }}>xAI Grok 2</option>
            </select>
          </div>

          {hasCredentials ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600 }}>
              <Check size={14} style={{ background: 'rgba(16,185,129,0.1)', padding: '2px', borderRadius: '50%' }} />
              API Connected
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning)', fontSize: '0.8rem', fontWeight: 600 }}>
              <Info size={14} />
              Offline Mode
            </div>
          )}
          <button className="icon-button" onClick={openSettings}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Panel views */}
      <main className="main-viewport">
        {activeTab === 'ingest' && (
          <DataIngestion 
            onDataLoaded={handleDataLoaded} 
            currentDatasetLength={dataset.length}
            profiles={profiles}
          />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard 
            data={dataset} 
            profiles={profiles}
          />
        )}

        {activeTab === 'chat' && (
          <ChatAssistant 
            apiKey={apiKey}
            grokApiKey={grokApiKey}
            activeEngine={activeEngine}
            hasCredentials={hasCredentials}
            onOpenSettings={openSettings}
          />
        )}

        {activeTab === 'recommendations' && (
          <Recommendations 
            apiKey={apiKey}
            grokApiKey={grokApiKey}
            activeEngine={activeEngine}
            datasetLength={dataset.length}
          />
        )}

        {activeTab === 'rag' && (
          <RagVisualizer 
            isIndexed={isIndexed}
            onIndexData={handleIndexData}
            indexingStatus={indexingStatus}
          />
        )}

        {activeTab === 'metabase' && (
          <MetabaseWorkspace 
            data={dataset}
            metabaseEmbedUrl={metabaseEmbedUrl}
          />
        )}
      </main>

      {/* Settings Modal (Credentials configuration) */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={20} style={{ color: 'var(--primary)' }} /> Settings Configuration
              </h3>
              <button 
                className="icon-button" 
                style={{ padding: '0.3rem' }} 
                onClick={() => setIsSettingsOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Google Gemini API Key</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="AIzaSy..." 
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Required for Google Embedding models (`text-embedding-004`).</span>
              </div>

              <div className="form-group">
                <label className="form-label">xAI Grok API Key</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="xai-..." 
                  value={tempGrokApiKey}
                  onChange={(e) => setTempGrokApiKey(e.target.value)}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Required to utilize Grok model router (`grok-latest`).</span>
              </div>

              <div className="form-group">
                <label className="form-label">Metabase Dashboard Embed URL (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="http://localhost:3000/embed/dashboard/..." 
                  value={tempMetabaseEmbedUrl}
                  onChange={(e) => setTempMetabaseEmbedUrl(e.target.value)}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Provide an embed URL to load a live Metabase instance directly.</span>
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Key tokens and embedding configurations are saved securely inside your browser local storage.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button 
                className="button secondary-btn" 
                onClick={() => setIsSettingsOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="button" 
                onClick={saveApiKey}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
