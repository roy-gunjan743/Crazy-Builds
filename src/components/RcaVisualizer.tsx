import { useState, useEffect } from 'react';
import { HelpCircle, TrendingDown } from 'lucide-react';
import type { RcaNode } from '../services/ragPipeline';

interface RcaVisualizerProps {
  nodes: RcaNode[];
  onReset: () => void;
}

export const RcaVisualizer: React.FC<RcaVisualizerProps> = ({ nodes, onReset }) => {
  const [step, setStep] = useState<number>(0);

  useEffect(() => {
    setStep(0);
    if (nodes.length === 0) return;

    // Set sequenced timeout steps to animate nodes lighting up
    const timer1 = setTimeout(() => setStep(1), 1000); // Reveal Product & Seasonality
    const timer2 = setTimeout(() => setStep(2), 2200); // Strike out Seasonality
    const timer3 = setTimeout(() => setStep(3), 3200); // Reveal Campaign node
    const timer4 = setTimeout(() => setStep(4), 4800); // Reveal Synthesis node

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', padding: '2rem', textAlign: 'center', gap: '0.75rem' }}>
        <HelpCircle size={36} style={{ opacity: 0.15 }} />
        <p style={{ fontSize: '0.75rem' }}>Submit a diagnostic question like "Why did sales drop?" to generate a Root Cause Analysis map.</p>
      </div>
    );
  }

  // Determine visibility states for each node based on the current step
  const isNodeVisible = (nodeId: string): boolean => {
    if (nodeId === 'region') return true;
    if (nodeId === 'product' || nodeId === 'seasonality') return step >= 1;
    if (nodeId === 'campaign') return step >= 3;
    if (nodeId === 'synthesis') return step >= 4;
    return false;
  };

  // Determine if a connection line is glowing active
  const isLineActive = (from: string, to: string): boolean => {
    if (from === 'region' && (to === 'product' || to === 'seasonality')) return step >= 1;
    if (from === 'product' && to === 'campaign') return step >= 3;
    if (from === 'campaign' && to === 'synthesis') return step >= 4;
    return false;
  };

  // Find node values
  const regionNode = nodes.find(n => n.id === 'region');
  const productNode = nodes.find(n => n.id === 'product');
  const campaignNode = nodes.find(n => n.id === 'campaign');
  const seasonalityNode = nodes.find(n => n.id === 'seasonality');
  const synthesisNode = nodes.find(n => n.id === 'synthesis');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <div className="rca-graph-container">
        {/* SVG Connectors Overlay */}
        <svg className="rca-svg-overlay">
          {/* Region -> Product connector */}
          <path 
            d="M 120 70 L 120 215" 
            className={`rca-connector ${isLineActive('region', 'product') ? 'active' : ''}`}
          />
          {/* Product -> Campaign connector */}
          <path 
            d="M 120 255 L 120 360" 
            className={`rca-connector ${isLineActive('product', 'campaign') ? 'active' : ''}`}
          />
          {/* Region -> Seasonality connector */}
          <path 
            d="M 220 70 L 290 120" 
            className={`rca-connector ${isLineActive('region', 'seasonality') ? 'active' : ''}`}
          />
          {/* Campaign -> Synthesis connector */}
          <path 
            d="M 220 385 L 290 315" 
            className={`rca-connector ${isLineActive('campaign', 'synthesis') ? 'synthesis-path' : ''}`}
          />
        </svg>

        {/* Node 1: Region variance check */}
        {regionNode && (
          <div 
            className={`rca-node-wrap visible`}
            style={{ left: regionNode.x + '%', top: regionNode.y + '%' }}
          >
            <div className="rca-card active">
              <div className="rca-node-title">{regionNode.label}</div>
              <div className="rca-node-desc">{regionNode.value}</div>
            </div>
          </div>
        )}

        {/* Node 2: Product check */}
        {productNode && (
          <div 
            className={`rca-node-wrap ${isNodeVisible('product') ? 'visible' : ''}`}
            style={{ left: productNode.x + '%', top: productNode.y + '%' }}
          >
            <div className={`rca-card ${step >= 1 ? 'active' : ''}`}>
              <div className="rca-node-title">{productNode.label}</div>
              <div className="rca-node-desc">{productNode.value}</div>
            </div>
          </div>
        )}

        {/* Node 3: Campaign match */}
        {campaignNode && (
          <div 
            className={`rca-node-wrap ${isNodeVisible('campaign') ? 'visible' : ''}`}
            style={{ left: campaignNode.x + '%', top: campaignNode.y + '%' }}
          >
            <div className={`rca-card ${step >= 3 ? 'active' : ''}`}>
              <div className="rca-node-title">{campaignNode.label}</div>
              <div className="rca-node-desc">{campaignNode.value}</div>
            </div>
          </div>
        )}

        {/* Node 4: Seasonality check (rules out / gets crossed out) */}
        {seasonalityNode && (
          <div 
            className={`rca-node-wrap ${isNodeVisible('seasonality') ? 'visible' : ''}`}
            style={{ left: seasonalityNode.x + '%', top: seasonalityNode.y + '%' }}
          >
            <div className={`rca-card ${step >= 2 ? 'eliminated' : 'active'}`}>
              <div className="rca-node-title">{seasonalityNode.label}</div>
              <div className="rca-node-desc">{seasonalityNode.value}</div>
            </div>
          </div>
        )}

        {/* Node 5: Synthesis */}
        {synthesisNode && (
          <div 
            className={`rca-node-wrap ${isNodeVisible('synthesis') ? 'visible' : ''}`}
            style={{ left: synthesisNode.x + '%', top: synthesisNode.y + '%' }}
          >
            <div className="rca-card synthesis">
              <div className="rca-node-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{synthesisNode.label}</span>
                {synthesisNode.confidence && (
                  <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(6,182,212,0.15)', color: 'var(--secondary)', border: '1px solid rgba(6,182,212,0.3)', padding: '0.1rem 0.3rem', textTransform: 'none' }}>
                    Conf: {synthesisNode.confidence}%
                  </span>
                )}
              </div>
              <div className="rca-node-desc">{synthesisNode.value}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--panel-border)', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <TrendingDown size={14} style={{ color: 'var(--warning)' }} />
          <span>Diagnostic RCA Investigator Active</span>
        </div>
        <button onClick={onReset} className="button secondary-btn" style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', height: 'auto' }}>
          Reset Visualizer
        </button>
      </div>
    </div>
  );
};
