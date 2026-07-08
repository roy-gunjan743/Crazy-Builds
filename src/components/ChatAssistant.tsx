import { useState, useRef, useEffect } from 'react';
import { 
  Send, RefreshCw, MessageSquare, Terminal, HelpCircle,
  BarChart2, Info, CheckCircle2, XCircle, Share2, Cpu
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart as ReLineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { RcaVisualizer } from './RcaVisualizer';
import type { RagResult, QueryStep, RcaNode, PersonaVoices } from '../services/ragPipeline';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  steps?: QueryStep[];
  chartConfig?: RagResult['chartConfig'];
  rcaGraph?: RcaNode[];
  personas?: PersonaVoices;
}

interface ChatAssistantProps {
  apiKey: string;
  grokApiKey: string;
  activeEngine: 'gemini' | 'grok';
  hasCredentials: boolean;
  onOpenSettings: () => void;
}

const COLORS = ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

const SUGGESTIONS = [
  "Why did sales drop, and when did this occur?",
  "Should we cut the budget for Region West?",
  "Which product category performed best in total sales?",
  "Which campaign generated the highest average ROI?"
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ 
  apiKey, 
  grokApiKey,
  activeEngine,
  hasCredentials,
  onOpenSettings
}) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Sidebar Tabs State
  const [sidebarTab, setSidebarTab] = useState<'rag' | 'rca'>('rag');
  const [activeSteps, setActiveSteps] = useState<QueryStep[]>([]);
  const [rcaNodes, setRcaNodes] = useState<RcaNode[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend;
    setQuery('');
    setLoading(true);

    const userMessage: Message = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Initial steps state
    setActiveSteps([
      { name: 'Semantic Data Retrieval', status: 'pending' },
      { name: 'Agentic Code Generation', status: 'pending' },
      { name: 'Local Sandbox Aggregation', status: 'pending' },
      { name: 'Response Synthesis', status: 'pending' }
    ]);
    setRcaNodes([]);
    setSidebarTab('rag');

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey,
          'x-grok-key': grokApiKey
        },
        body: JSON.stringify({ 
          query: userText,
          engine: activeEngine
        })
      });

      if (!res.ok) {
        throw new Error(`Server failed using ${activeEngine.toUpperCase()} engine.`);
      }

      const result = await res.json();

      const aiMessage: Message = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: result.answer,
        timestamp: new Date(),
        steps: result.steps,
        chartConfig: result.chartConfig,
        rcaGraph: result.rcaGraph,
        personas: result.personas
      };

      setMessages(prev => [...prev, aiMessage]);
      if (result.steps) {
        setActiveSteps(result.steps);
      }
      
      // Auto-focus on RCA tab if graph is returned to WOW the user
      if (result.rcaGraph && result.rcaGraph.length > 0) {
        setRcaNodes(result.rcaGraph);
        setSidebarTab('rca');
      }
    } catch (e: any) {
      const errMessage: Message = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: `Error analyzing query via ${activeEngine.toUpperCase()}: ${e.message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errMessage]);
      
      setActiveSteps(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'failed', detail: 'Aborted due to process error.' } : s));
    } finally {
      setLoading(false);
    }
  };

  const formatMessageText = (text: string) => {
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    formatted = formatted.replace(/^### (.*?)$/gm, '<h4 style="font-family: var(--font-display); font-weight:700; margin: 1rem 0 0.5rem 0; color: #fff;">$1</h4>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff; font-weight:600;">$1</strong>');
    formatted = formatted.replace(/^- (.*?)$/gm, '<li style="margin-left: 1.25rem; margin-top: 0.25rem; list-style-type: square;">$1</li>');
    formatted = formatted.replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 0.1rem 0.3rem; border-radius: 4px; font-family: monospace; font-size: 0.85em;">$1</code>');
    
    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  const renderInlineChart = (config: RagResult['chartConfig']) => {
    if (!config || !config.data || config.data.length === 0) return null;

    return (
      <div className="chat-inline-chart">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <BarChart2 size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{config.title}</span>
        </div>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            {config.type === 'line' ? (
              <ReLineChart data={config.data}>
                <XAxis dataKey={config.xAxisKey} stroke="var(--text-muted)" style={{ fontSize: '0.65rem' }} tickLine={false} />
                <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.65rem' }} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', fontSize: '0.75rem' }} />
                <Line type="monotone" dataKey={config.yAxisKey} stroke="var(--primary)" strokeWidth={2} dot={true} />
              </ReLineChart>
            ) : config.type === 'pie' ? (
              <RePieChart>
                <Pie
                  data={config.data}
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  dataKey={config.yAxisKey}
                  nameKey={config.xAxisKey}
                >
                  {config.data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', fontSize: '0.75rem' }} />
              </RePieChart>
            ) : (
              <BarChart data={config.data}>
                <XAxis dataKey={config.xAxisKey} stroke="var(--text-muted)" style={{ fontSize: '0.65rem' }} tickLine={false} />
                <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.65rem' }} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', fontSize: '0.75rem' }} />
                <Bar dataKey={config.yAxisKey} fill="var(--secondary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-container">
      {/* Messages Thread (Left) */}
      <div className="glass-panel chat-messages-area">
        <div className="messages-list">
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '1rem', padding: '2rem 1rem' }}>
              <MessageSquare size={48} style={{ opacity: 0.2 }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-main)' }}>Conversational AI Agent ({activeEngine.toUpperCase()})</h3>
              <p style={{ textAlign: 'center', fontSize: '0.9rem', maxWidth: '400px', lineHeight: 1.5 }}>
                Ask business questions. The backend will query Chroma DB vectors, write Node sandbox VM calculations, and return results via {activeEngine === 'grok' ? 'xAI Grok' : 'Google Gemini'}.
              </p>
              
              {!hasCredentials && (
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--warning)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '450px', cursor: 'pointer' }} onClick={onOpenSettings}>
                  <Info size={16} style={{ flexShrink: 0 }} />
                  <span><strong>Credentials Missing</strong>: Dashboard is in Offline mode. Configure a Gemini or Grok API key in Settings (or server .env) to activate vector search and LLMs.</span>
                </div>
              )}

              <div style={{ marginTop: '1.5rem', width: '100%' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', textAlign: 'center' }}>Suggested Queries</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {SUGGESTIONS.map((s, idx) => (
                    <button key={idx} className="button secondary-btn" style={{ fontSize: '0.75rem', textAlign: 'left', padding: '0.6rem 0.8rem', height: 'auto', lineBreak: 'anywhere' }} onClick={() => handleSend(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.sender}`}>
                  <div className="bubble-content">
                    {formatMessageText(msg.text)}
                    {msg.chartConfig && renderInlineChart(msg.chartConfig)}
                    {msg.personas && (
                      <div className="boardroom-debate-panel">
                        <div className="boardroom-debate-header">
                          <Cpu size={14} style={{ color: 'var(--secondary)', marginRight: '0.25rem' }} /> Multi-Agent Decision Debate
                        </div>
                        <div className="boardroom-debate-grid">
                          <div className="debate-card cfo">
                            <div className="debate-card-title">🧮 The CFO (Cost-Focused)</div>
                            <div className="debate-card-body">{msg.personas.cfo}</div>
                          </div>
                          <div className="debate-card growth">
                            <div className="debate-card-title">📈 The Growth Agent (Opportunity-Focused)</div>
                            <div className="debate-card-body">{msg.personas.growth}</div>
                          </div>
                          <div className="debate-card risk">
                            <div className="debate-card-title">⚠️ The Risk Agent (Caution-Focused)</div>
                            <div className="debate-card-body">{msg.personas.risk}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.rcaGraph && msg.rcaGraph.length > 0 && (
                      <button 
                        onClick={() => {
                          setRcaNodes(msg.rcaGraph || []);
                          setSidebarTab('rca');
                        }}
                        className="button secondary-btn"
                        style={{ fontSize: '0.7rem', padding: '0.4rem 0.6rem', marginTop: '0.75rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <Share2 size={12} /> View Diagnostic RCA Graph
                      </button>
                    )}
                  </div>
                  <div className="bubble-meta">
                    {msg.sender === 'user' ? 'You' : `${activeEngine.toUpperCase()} Agent`} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="chat-bubble ai">
                  <div className="bubble-content" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
                    <RefreshCw className="animate-spin" size={16} />
                    <span>Rabbitt backend compiler is running analysis via {activeEngine.toUpperCase()}...</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="chat-input-bar">
          <input 
            type="text" 
            className="chat-input" 
            placeholder={`Ask a question using ${activeEngine.toUpperCase()} (e.g. 'Show regional sales anomalies')...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend(query);
            }}
            disabled={loading}
          />
          <button className="button" style={{ padding: '0.6rem' }} onClick={() => handleSend(query)} disabled={loading || !query.trim()}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* RAG Sidebar Panel / RCA Graph (Right Sidebar) */}
      <div className="glass-panel chat-sidebar-panel">
        {/* Toggle Header */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--panel-border)', marginBottom: '1rem', flexShrink: 0 }}>
          <button 
            className={`nav-tab ${sidebarTab === 'rag' ? 'active' : ''}`}
            style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', height: 'auto', border: 'none', borderRadius: '6px', justifyContent: 'center' }}
            onClick={() => setSidebarTab('rag')}
          >
            RAG Steps
          </button>
          <button 
            className={`nav-tab ${sidebarTab === 'rca' ? 'active' : ''}`}
            style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', height: 'auto', border: 'none', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
            onClick={() => setSidebarTab('rca')}
          >
            RCA Graph
            {rcaNodes.length > 0 && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)', boxShadow: '0 0 6px var(--warning)' }}></span>
            )}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sidebarTab === 'rag' ? (
            <>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.75rem' }}>
                <Terminal size={18} style={{ color: 'var(--primary)' }} /> Backend RAG pipeline
              </h3>
              
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem', lineHeight: 1.4 }}>
                Live state tracking of Chroma DB vector query and VM sandboxed aggregators.
              </p>

              <div className="rag-steps-container">
                {activeSteps.map((step, idx) => (
                  <div key={idx} className={`rag-step-node ${step.status}`}>
                    <div className="rag-step-header">
                      <div className="step-indicator">
                        {step.status === 'success' ? (
                          <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                        ) : step.status === 'failed' ? (
                          <XCircle size={14} style={{ color: 'var(--error)' }} />
                        ) : (
                          <RefreshCw className="animate-spin" size={14} style={{ color: 'var(--secondary)' }} />
                        )}
                        <span>{step.name}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: step.status === 'success' ? 'var(--success)' : step.status === 'failed' ? 'var(--error)' : 'var(--secondary)' }}>
                        {step.status}
                      </span>
                    </div>
                    
                    {step.detail && <div className="step-details">{step.detail}</div>}
                    
                    {step.code && (
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Terminal size={10} /> Sandboxed VM Script:
                        </div>
                        <pre className="step-code"><code>{step.code}</code></pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {activeSteps.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '0.5rem', minHeight: '200px', marginTop: '2rem' }}>
                  <HelpCircle size={32} style={{ opacity: 0.15 }} />
                  <p style={{ fontSize: '0.75rem', textAlign: 'center' }}>No query processed yet. Send a message to trace execution steps.</p>
                </div>
              )}
            </>
          ) : (
            <RcaVisualizer nodes={rcaNodes} onReset={() => setRcaNodes([])} />
          )}
        </div>
      </div>
    </div>
  );
};
