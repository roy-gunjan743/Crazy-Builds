import { useState, useEffect } from 'react';
import { Eye, Info, Database, Compass, Layers, CheckCircle } from 'lucide-react';
import type { DataChunk } from '../services/ragPipeline';

interface RagVisualizerProps {
  isIndexed: boolean;
  onIndexData: () => void;
  indexingStatus: string;
}

export const RagVisualizer: React.FC<RagVisualizerProps> = ({
  isIndexed,
  onIndexData,
  indexingStatus
}) => {
  const [chunks, setChunks] = useState<DataChunk[]>([]);
  const [selectedChunk, setSelectedChunk] = useState<DataChunk | null>(null);

  const fetchChunks = async () => {
    try {
      const res = await fetch('/api/chunks');
      const result = await res.json();
      setChunks(result.chunks || []);
    } catch (e) {
      console.error('Failed to load chunks from Express server:', e);
    }
  };

  useEffect(() => {
    fetchChunks();
  }, [indexingStatus]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page Header & Index Actions */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.6rem' }}>RAG Vector Index Inspector</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Inspect how the backend system chunks records, generates embeddings, and structures the vector space.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {indexingStatus && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '250px', textAlign: 'right' }}>
              {indexingStatus}
            </div>
          )}
          <button 
            className={`button ${isIndexed ? 'secondary-btn' : ''}`} 
            onClick={onIndexData} 
            disabled={chunks.length === 0}
          >
            {isIndexed ? (
              <>
                <CheckCircle size={16} style={{ color: 'var(--primary)' }} />
                Re-Index Vectors
              </>
            ) : (
              <>
                <Database size={16} />
                Generate Vector Embeddings
              </>
            )}
          </button>
        </div>
      </div>

      {chunks.length === 0 ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', color: 'var(--text-muted)' }}>
          <Database size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.15rem' }}>Index is Empty</h3>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Upload a spreadsheet in the **Upload Data** tab to construct vector document chunks.</p>
        </div>
      ) : (
        <div className="rag-inspector-grid">
          {/* Chunks List */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} style={{ color: 'var(--primary)' }} /> Document Chunks ({chunks.length})
            </h3>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              {chunks.map((chunk, index) => {
                const isEmbedded = !!chunk.embedding;
                const isSelected = selectedChunk?.id === chunk.id;

                return (
                  <div 
                    key={chunk.id} 
                    className={`chunk-card`} 
                    style={{ 
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--primary)' : 'var(--panel-border)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255, 255, 255, 0.01)'
                    }}
                    onClick={() => setSelectedChunk(chunk)}
                  >
                    <div className="chunk-header">
                      <span>CHUNK {index + 1} ({chunk.id})</span>
                      <span style={{ color: isEmbedded ? 'var(--primary)' : 'var(--warning)' }}>
                        {isEmbedded ? 'EMBEDDING ACTIVE' : 'PENDING EMBEDDING'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      <span>Row Range: L{chunk.rowIndexStart} - L{chunk.rowIndexEnd}</span>
                      <span>Length: {chunk.text.length} chars</span>
                    </div>
                    <p className="chunk-text">{chunk.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chunk details and Vector Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ minHeight: '280px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={18} style={{ color: 'var(--secondary)' }} /> Chunk Detail Viewer
              </h3>

              {selectedChunk ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Identifier:</span>
                    <span style={{ fontWeight: 600 }}>{selectedChunk.id}</span>
                  </div>
                  
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Generated Text Representation:</div>
                    <pre style={{ 
                      background: 'rgba(0,0,0,0.3)', 
                      padding: '0.75rem', 
                      borderRadius: '8px', 
                      fontFamily: 'monospace', 
                      fontSize: '0.75rem', 
                      maxHeight: '150px', 
                      overflowY: 'auto',
                      border: '1px solid var(--panel-border)',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedChunk.text}
                    </pre>
                  </div>

                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Vector Embedding Vector:</div>
                    {selectedChunk.embedding ? (
                      <div>
                        <div style={{ fontStyle: 'italic', fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>
                          Model: text-embedding-004 (768 dimensions)
                        </div>
                        <pre style={{ 
                          background: 'rgba(16,185,129,0.05)', 
                          padding: '0.5rem', 
                          borderRadius: '6px', 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem',
                          border: '1px solid rgba(16,185,129,0.2)',
                          color: 'var(--primary)',
                          overflowX: 'auto'
                        }}>
                          [{selectedChunk.embedding.slice(0, 8).map(v => v.toFixed(5)).join(', ')}, ...]
                        </pre>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--warning)', fontSize: '0.75rem' }}>No active embedding vector. Run indexing above to generate mathematically search vectors.</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '0.5rem' }}>
                  <Info size={24} style={{ opacity: 0.2 }} />
                  <p style={{ fontSize: '0.75rem' }}>Select a document card from the left panel to inspect vector coordinates and text maps.</p>
                </div>
              )}
            </div>

            {/* Educational Info */}
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--secondary)', background: 'rgba(6,182,212,0.02)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Compass size={16} /> How RAG Works with Tables
              </h3>
              
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                <li>
                  <strong style={{ color: 'var(--text-main)' }}>1. Text Chunking:</strong> Spreadsheet records are parsed row-by-row and joined together as structured descriptions so that semantic meaning is preserved.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-main)' }}>2. Embedding:</strong> Each text block is sent to Google's embedding model to generate a 768-dimensional coordinate matching its semantic context.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-main)' }}>3. Search:</strong> When you search, cosine similarity is calculated between your query and the coordinates, returning matching data context.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-main)' }}>4. Code Sandbox:</strong> To solve math queries (e.g. totals, averages), the LLM generates raw Javascript that runs directly on the table, eliminating math hallucinations.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
