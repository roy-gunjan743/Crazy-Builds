import { useMemo, useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import { TrendingUp, ShoppingBag, Target, FileSpreadsheet, AlertCircle, AlertTriangle, Activity, BarChart2, CheckCircle2, RefreshCw, FlaskConical, CheckCheck, XCircle } from 'lucide-react';
import type { ColumnProfile } from '../services/dataCleaner';

interface DashboardProps {
  data: any[];
  profiles: ColumnProfile[];
}

const COLORS = ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

export const Dashboard: React.FC<DashboardProps> = ({ data, profiles }) => {
  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'anomalies'>('overview');

  // Advanced Analytics State
  const [analytics, setAnalytics] = useState<{
    anomalies: any[];
    momGrowth: any[];
    rollingAverage: any[];
    autoencoder?: {
      anomalies: any[];
      allErrors: number[];
      threshold: number;
      trainedEpochs: number;
      featureColumns: string[];
      lossHistory: number[];
    };
  }>({ anomalies: [], momGrowth: [], rollingAverage: [] });
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  // ── Data Verification Panel state ─────────────────────────────────────────
  const [verifyFilterCol, setVerifyFilterCol] = useState('');
  const [verifyFilterVal, setVerifyFilterVal] = useState('All');
  const [verifySumCol, setVerifySumCol]       = useState('');
  const [verifyResult, setVerifyResult]       = useState<any>(null);
  const [verifyLoading, setVerifyLoading]     = useState(false);
  const [verifyError, setVerifyError]         = useState('');
  // ──────────────────────────────────────────────────────────────────────────

  // Fetch Advanced Analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (data.length === 0) return;
      setAnalyticsLoading(true);
      try {
        const res = await fetch('/api/analytics');
        const result = await res.json();
        setAnalytics(result);
      } catch (err) {
        console.error('Failed to load advanced analytics:', err);
      } finally {
        setAnalyticsLoading(false);
      }
    };
    fetchAnalytics();
  }, [data]);

  // Schematic/Profile-Driven Column Mapper (no keyword substring checking!)
  const columns = useMemo(() => {
    if (data.length === 0 || profiles.length === 0) {
      return { sales: '', volume: '', roi: '', date: '', region: '', product: '', campaign: '', spend: '' };
    }

    const numerics = profiles.filter(p => p.type === 'numeric');
    const categoricals = profiles.filter(p => p.type === 'categorical');
    const dates = profiles.filter(p => p.type === 'date');

    // 1. Sales: numeric column with the largest mean/max value
    let sales = '';
    if (numerics.length > 0) {
      sales = numerics.reduce((best, cur) => 
        (cur.mean || 0) > (best.mean || 0) ? cur : best
      ).name;
    }

    // 2. ROI: numeric column where values are small floats (typically mean < 15, stddev < mean * 2, min >= 0)
    let roi = '';
    const roiCandidates = numerics.filter(p => p.name !== sales && (p.mean || 0) < 15 && (p.min ?? 0) >= 0);
    if (roiCandidates.length > 0) {
      roi = roiCandidates.reduce((best, cur) => {
        const distCur = Math.abs((cur.mean || 0) - 3);
        const distBest = Math.abs((best.mean || 0) - 3);
        return distCur < distBest ? cur : best;
      }).name;
    }

    // 3. Spend: numeric column where values are moderate positive numbers (larger than ROI, smaller than sales)
    let spend = '';
    const spendCandidates = numerics.filter(p => p.name !== sales && p.name !== roi);
    if (spendCandidates.length > 0) {
      spend = spendCandidates.reduce((best, cur) => 
        (cur.mean || 0) > (best.mean || 0) ? cur : best
      ).name;
    }

    // 4. Volume: numeric column that remains
    let volume = '';
    const volCandidates = numerics.filter(p => p.name !== sales && p.name !== roi && p.name !== spend);
    if (volCandidates.length > 0) {
      volume = volCandidates[0].name;
    } else {
      volume = spend; // fallback if only 3 numeric columns exist
    }

    // 5. Date: first date column
    const date = dates.length > 0 ? dates[0].name : '';

    // 6. Categoricals mapping by cardinality sequence: Region (lowest) -> Campaign (mid) -> Product (highest)
    let region = '';
    let campaign = '';
    let product = '';

    if (categoricals.length > 0) {
      const sortedCats = [...categoricals].sort((a, b) => a.uniqueCount - b.uniqueCount);
      region = sortedCats[0]?.name || '';
      campaign = sortedCats[1]?.name || sortedCats[0]?.name || '';
      product = sortedCats[2]?.name || sortedCats[1]?.name || sortedCats[0]?.name || '';
    }

    return { sales, volume, roi, date, region, product, campaign, spend };
  }, [data, profiles]);

  // Categorical and numeric column lists for verification panel
  const catCols = useMemo(() => {
    const keys = data.length > 0 ? Object.keys(data[0]) : [];
    return keys.filter(k => profiles.find(p => p.name === k)?.type === 'categorical');
  }, [data, profiles]);

  const numCols = useMemo(() => {
    const keys = data.length > 0 ? Object.keys(data[0]) : [];
    return keys.filter(k => profiles.find(p => p.name === k)?.type === 'numeric');
  }, [data, profiles]);

  // Unique values for the selected filter column
  const filterValues = useMemo(() => {
    if (!verifyFilterCol) return [];
    const vals = new Set(data.map(r => String(r[verifyFilterCol] ?? '')).filter(Boolean));
    return ['All', ...Array.from(vals).sort()];
  }, [data, verifyFilterCol]);

  // Client-side sum for the current verification selection
  const clientSum = useMemo(() => {
    if (!verifySumCol) return null;
    const filtered = (verifyFilterCol && verifyFilterVal !== 'All')
      ? data.filter(r => String(r[verifyFilterCol]) === verifyFilterVal)
      : data;
    const sum = filtered.reduce((acc, row) => {
      const v = parseFloat(String(row[verifySumCol] ?? '').replace(/[^0-9.\-]/g, ''));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    return { sum: parseFloat(sum.toFixed(4)), count: filtered.length };
  }, [data, verifyFilterCol, verifyFilterVal, verifySumCol]);

  const runVerify = useCallback(async () => {
    if (!verifySumCol) return;
    setVerifyLoading(true);
    setVerifyError('');
    setVerifyResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterCol: verifyFilterCol || undefined,
          filterVal: verifyFilterVal !== 'All' ? verifyFilterVal : undefined,
          sumCol: verifySumCol
        })
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Verification failed');
      }
      setVerifyResult(await res.json());
    } catch (e: any) {
      setVerifyError(e.message);
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyFilterCol, verifyFilterVal, verifySumCol]);

  // Match = client and server sums agree to 2 decimal places
  const isMatch = verifyResult && clientSum
    ? Math.abs(verifyResult.serverSum - clientSum.sum) < 0.01
    : null;

  // Aggregate KPI Metrics
  const kpis = useMemo(() => {
    if (data.length === 0) return null;

    let totalSales = 0;
    let totalVolume = 0;
    let avgRoi = 0;
    let activeCampaigns = new Set();

    data.forEach(row => {
      if (columns.sales) totalSales += Number(row[columns.sales] || 0);
      if (columns.volume) totalVolume += Number(row[columns.volume] || 0);
      if (columns.roi) avgRoi += Number(row[columns.roi] || 0);
      if (columns.campaign && row[columns.campaign]) {
        activeCampaigns.add(row[columns.campaign]);
      }
    });

    return {
      totalSales: totalSales ? `$${totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A',
      totalVolume: totalVolume ? totalVolume.toLocaleString() : 'N/A',
      avgRoi: columns.roi ? `${(avgRoi / data.length).toFixed(2)}x` : 'N/A',
      campaignsCount: activeCampaigns.size || 'N/A',
    };
  }, [data, columns]);

  // Aggregated data for Trend Chart
  const trendData = useMemo(() => {
    if (!columns.date || !columns.sales) return [];
    
    const groups: { [key: string]: number } = {};
    data.forEach(row => {
      const dateStr = String(row[columns.date]);
      groups[dateStr] = (groups[dateStr] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups)
      .sort()
      .map(date => ({
        date,
        Sales: parseFloat(groups[date].toFixed(2)),
      }));
  }, [data, columns]);

  // Aggregated data for Regional Breakdown
  const regionData = useMemo(() => {
    if (!columns.region || !columns.sales) return [];

    const groups: { [key: string]: number } = {};
    data.forEach(row => {
      const reg = String(row[columns.region]);
      groups[reg] = (groups[reg] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups).map(name => ({
      name,
      Sales: parseFloat(groups[name].toFixed(2)),
    })).sort((a, b) => b.Sales - a.Sales);
  }, [data, columns]);

  // Aggregated data for Product Performance
  const productData = useMemo(() => {
    if (!columns.product || !columns.sales) return [];

    const groups: { [key: string]: number } = {};
    data.forEach(row => {
      const prod = String(row[columns.product]);
      groups[prod] = (groups[prod] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups).map(name => ({
      name,
      value: parseFloat(groups[name].toFixed(2)),
    })).sort((a, b) => b.value - a.value);
  }, [data, columns]);

  // Aggregated data for Campaigns ROI
  const campaignData = useMemo(() => {
    if (!columns.campaign) return [];

    const spendMap: { [key: string]: number } = {};
    const roiMap: { [key: string]: { sum: number; count: number } } = {};

    data.forEach(row => {
      const camp = String(row[columns.campaign]);
      if (columns.spend) {
        spendMap[camp] = (spendMap[camp] || 0) + Number(row[columns.spend] || 0);
      }
      if (columns.roi) {
        if (!roiMap[camp]) roiMap[camp] = { sum: 0, count: 0 };
        roiMap[camp].sum += Number(row[columns.roi] || 0);
        roiMap[camp].count += 1;
      }
    });

    return Object.keys(spendMap).map(name => ({
      name,
      Spend: spendMap[name] || 0,
      ROI: roiMap[name] ? parseFloat((roiMap[name].sum / roiMap[name].count).toFixed(2)) : 0,
    }));
  }, [data, columns]);

  // Automated Insights Narrative
  const autoInsights = useMemo(() => {
    if (data.length === 0) return [];
    const insights: string[] = [];

    if (regionData.length > 0) {
      insights.push(`**Top Performing Region**: ${regionData[0].name} lead in total sales generating $${regionData[0].Sales.toLocaleString()}.`);
    }
    if (productData.length > 0) {
      insights.push(`**Top Contributor**: ${productData[0].name} is your highest contributing item, representing $${productData[0].value.toLocaleString()} in revenue.`);
    }
    
    // Add anomaly insight summary if database detected them
    if (analytics.anomalies.length > 0) {
      const topAnom = [...analytics.anomalies].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))[0];
      insights.push(`**Data Anomalies Detected**: Flashed ${analytics.anomalies.length} outliers. Row ${topAnom.rowIndex} in '${topAnom.columnName}' is an outlier with a Z-score of **${topAnom.zScore}**.`);
    }

    return insights;
  }, [regionData, productData, analytics, data]);

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <AlertCircle size={48} style={{ marginBottom: '1rem', color: 'var(--warning)' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem' }}>No Active Dashboard</h3>
        <p style={{ marginTop: '0.5rem', textAlign: 'center', fontSize: '0.9rem' }}>Please upload or configure your dataset in the **Upload Data** tab to load analytics charts.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Metrics Row */}
      {kpis && (
        <div className="dashboard-grid">
          <div className="glass-panel kpi-card">
            <div className="kpi-icon-wrap">
              <TrendingUp size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Sales Revenue</div>
              <div className="kpi-value">{kpis.totalSales}</div>
            </div>
          </div>

          <div className="glass-panel kpi-card">
            <div className="kpi-icon-wrap">
              <ShoppingBag size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Units Volume</div>
              <div className="kpi-value">{kpis.totalVolume}</div>
            </div>
          </div>

          <div className="glass-panel kpi-card">
            <div className="kpi-icon-wrap">
              <Target size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Average Campaign ROI</div>
              <div className="kpi-value">{kpis.avgRoi}</div>
            </div>
          </div>

          <div className="glass-panel kpi-card">
            <div className="kpi-icon-wrap">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Records Processed</div>
              <div className="kpi-value">{data.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Switch buttons */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', gap: '1.5rem', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveSubTab('overview')}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: activeSubTab === 'overview' ? 'var(--primary)' : 'var(--text-muted)', 
            fontWeight: 600, 
            fontSize: '1rem', 
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: activeSubTab === 'overview' ? '2px solid var(--primary)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <BarChart2 size={16} /> Performance Overview
        </button>
        <button 
          onClick={() => setActiveSubTab('anomalies')}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: activeSubTab === 'anomalies' ? 'var(--warning)' : 'var(--text-muted)', 
            fontWeight: 600, 
            fontSize: '1rem', 
            cursor: 'pointer',
            paddingBottom: '0.5rem',
            borderBottom: activeSubTab === 'anomalies' ? '2px solid var(--warning)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Activity size={16} /> Anomalies & Trends
        </button>
      </div>

      {activeSubTab === 'overview' ? (
        <>
          {/* Narrative Auto-Analysis Summary */}
          {autoInsights.length > 0 && (
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--primary)', background: 'rgba(16,185,129,0.02)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={16} /> Automated Performance Insights
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                {autoInsights.map((insight, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--primary)' }}>•</span>
                    <span dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Visual Charts Layout */}
          <div className="dashboard-charts">
            {/* Sales Trend Chart */}
            {trendData.length > 0 && (
              <div className="glass-panel" style={{ height: '350px' }}>
                <h3 className="chart-title">Revenue Sales Timeline</h3>
                <div style={{ width: '100%', height: '85%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                      <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                      <Tooltip 
                        contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }} 
                      />
                      <Line type="monotone" dataKey="Sales" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Regional Bar Chart */}
            {regionData.length > 0 && (
              <div className="glass-panel" style={{ height: '350px' }}>
                <h3 className="chart-title">Regional Performance breakdown</h3>
                <div style={{ width: '100%', height: '85%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                      <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                      <Tooltip 
                        contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }} 
                      />
                      <Bar dataKey="Sales" fill="var(--secondary)" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Product Mix Pie Chart */}
            {productData.length > 0 && (
              <div className="glass-panel" style={{ height: '350px' }}>
                <h3 className="chart-title">Product Mix Revenue</h3>
                <div style={{ width: '100%', height: '85%', display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1.2, height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={productData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {productData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }}
                          formatter={(val) => [`$${Number(val ?? 0).toLocaleString()}`, 'Sales']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {productData.map((entry, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: COLORS[idx % COLORS.length] }}></div>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{entry.name}:</span>
                        <span>${entry.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Campaign ROI & Budget Allocation */}
            {campaignData.length > 0 && (
              <div className="glass-panel" style={{ height: '350px' }}>
                <h3 className="chart-title">Marketing Channels Budget & ROI</h3>
                <div style={{ width: '100%', height: '85%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campaignData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                      <YAxis yAxisId="left" orientation="left" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} label={{ value: 'Spend ($)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: '0.75rem' } }} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} label={{ value: 'ROI (x)', angle: 90, position: 'insideRight', style: { fill: 'var(--text-muted)', fontSize: '0.75rem' } }} />
                      <Tooltip 
                        contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }} 
                      />
                      <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
                      <Bar yAxisId="left" dataKey="Spend" fill="var(--info)" radius={[4, 4, 0, 0]} name="Marketing Cost" />
                      <Bar yAxisId="right" dataKey="ROI" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Average ROI" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {analyticsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: '1rem' }}>
              <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--warning)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Generating statistical anomalies and computing standard deviations...</p>
            </div>
          ) : (
            <>
              {/* Neural Autoencoder Training Diagnostics */}
              {analytics.autoencoder && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
                  <div className="glass-panel" style={{ height: '300px' }}>
                    <h3 className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
                      <Activity size={16} /> Autoencoder Training Loss Curve (Adam Optimizer MSE)
                    </h3>
                    <div style={{ width: '100%', height: '80%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics.autoencoder.lossHistory.map((loss, idx) => ({ epoch: idx + 1, Loss: loss }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="epoch" stroke="var(--text-muted)" style={{ fontSize: '0.7rem' }} />
                          <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.7rem' }} />
                          <Tooltip contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }} />
                          <Line type="monotone" dataKey="Loss" stroke="var(--secondary)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '300px', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="pulse-dot" style={{ background: '#22c55e' }}></span>
                      <strong style={{ color: '#22c55e', fontSize: '0.9rem', letterSpacing: '0.5px' }}>AUTOENCODER STABLE</strong>
                    </div>
                    
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      A 4-layer bottleneck neural net was trained for <strong>{analytics.autoencoder.trainedEpochs} epochs</strong> on the numeric dimensions. Threshold set semantically at <strong>{analytics.autoencoder.threshold.toFixed(5)} reconstruction MSE</strong> (μ + 2σ).
                    </div>

                    <div style={{ fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>FEATURES ANALYZED:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {analytics.autoencoder.featureColumns.map((col, idx) => (
                          <span key={idx} style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--secondary)' }}>
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upper Grid: Z-score list & Autoencoder Neural Outliers */}
              <div className="dashboard-charts">
                {/* Z-score outlier log console */}
                <div className="glass-panel" style={{ height: '380px', display: 'flex', flexDirection: 'column' }}>
                  <h3 className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
                    <AlertTriangle size={18} /> Z-score Standard Deviation Outliers
                  </h3>
                  
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {analytics.anomalies.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', color: 'var(--text-muted)' }}>
                        <CheckCircle2 size={36} style={{ color: 'var(--primary)', marginBottom: '0.5rem', opacity: 0.6 }} />
                        <p style={{ fontSize: '0.85rem' }}>No data points exceed standard 2.0x standard deviation boundaries.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {analytics.anomalies.map((anom, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              background: 'rgba(245, 158, 11, 0.03)', 
                              border: '1px solid rgba(245, 158, 11, 0.15)',
                              borderRadius: '8px',
                              padding: '0.75rem 1rem',
                              fontSize: '0.8rem',
                              lineHeight: 1.4
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#fff', marginBottom: '0.2rem' }}>
                              <span>Field: {anom.columnName} • Row {anom.rowIndex}</span>
                              <span style={{ color: 'var(--warning)' }}>Z-Score: {anom.zScore}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                              Value is **{anom.value.toLocaleString()}** (Mean: {anom.mean.toLocaleString()} • Dev: {anom.stdDev})
                            </div>
                            <div style={{ fontStyle: 'italic', marginTop: '0.25rem', color: 'rgba(255,255,255,0.7)' }}>
                              {anom.details}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Autoencoder neural outlier console */}
                <div className="glass-panel" style={{ height: '380px', display: 'flex', flexDirection: 'column' }}>
                  <h3 className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
                    <Activity size={18} /> Deep Autoencoder Neural Outliers
                  </h3>
                  
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {!analytics.autoencoder || analytics.autoencoder.anomalies.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', color: 'var(--text-muted)' }}>
                        <CheckCircle2 size={36} style={{ color: 'var(--secondary)', marginBottom: '0.5rem', opacity: 0.6 }} />
                        <p style={{ fontSize: '0.85rem' }}>No neural reconstruction error points exceeded threshold limits.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {analytics.autoencoder.anomalies.map((anom, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              background: 'rgba(6, 182, 212, 0.03)', 
                              border: '1px solid rgba(6, 182, 212, 0.15)',
                              borderRadius: '8px',
                              padding: '0.75rem 1rem',
                              fontSize: '0.8rem',
                              lineHeight: 1.4
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#fff', marginBottom: '0.2rem' }}>
                              <span>Row {anom.rowIndex} • Score: {(anom.anomalyScore * 100).toFixed(0)}%</span>
                              <span style={{ color: 'var(--secondary)' }}>Recon Error: {anom.reconstructionError.toFixed(5)}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                              Outlier is **{anom.errorZScore}σ** above threshold MSE ({analytics.autoencoder!.threshold.toFixed(5)})
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                              {anom.topContributors.map((c: any, i: number) => (
                                <span key={i} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.68rem', border: '1px solid var(--panel-border)' }}>
                                  {c.feature}: {c.error.toFixed(4)} MSE
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* MoM Growth Chart */}
              <div className="glass-panel" style={{ height: '380px' }}>
                <h3 className="chart-title">Month-over-Month Growth % (Verify by Eye)</h3>
                <div style={{ width: '100%', height: '80%' }}>
                  {analytics.momGrowth.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                      No temporal timeline data found.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.momGrowth} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="month" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} />
                        <YAxis yAxisId="left" stroke="var(--text-muted)" style={{ fontSize: '0.75rem' }} label={{ value: 'Aggregate Sales ($)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: '0.75rem' } }} />
                        <YAxis yAxisId="right" orientation="right" stroke="var(--warning)" style={{ fontSize: '0.75rem' }} label={{ value: 'Growth MoM (%)', angle: 90, position: 'insideRight', style: { fill: 'var(--warning)', fontSize: '0.75rem' } }} />
                        <Tooltip 
                          contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }} 
                        />
                        <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                        <Bar yAxisId="left" dataKey="value" fill="var(--secondary)" name="Total Monthly Sales" radius={[3,3,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="changePercent" stroke="var(--warning)" strokeWidth={2.5} name="Growth Change %" dot={{ r: 4 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Lower Timeline: Rolling Average Comparison Chart */}
              {analytics.rollingAverage.length > 0 && (
                <div className="glass-panel" style={{ height: '360px' }}>
                  <h3 className="chart-title">7-Period Rolling Average vs Daily Sales (Trend Breaks)</h3>
                  <div style={{ width: '100%', height: '85%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.rollingAverage} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="var(--text-muted)" style={{ fontSize: '0.7rem' }} />
                        <YAxis stroke="var(--text-muted)" style={{ fontSize: '0.7rem' }} />
                        <Tooltip 
                          contentStyle={{ background: '#111827', border: '1px solid var(--panel-border)', borderRadius: '8px', color: '#fff' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                        <Area type="monotone" dataKey="value" fill="rgba(6, 182, 212, 0.05)" stroke="var(--secondary)" strokeWidth={1.5} name="Daily Value" />
                        <Line type="monotone" dataKey="rollingAvg" stroke="var(--primary)" strokeWidth={2.5} name="7-Period Rolling Average" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ════════ DATA VERIFICATION PANEL ════════ */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FlaskConical size={20} style={{ color: 'var(--secondary)' }} />
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>
              Data Verification Panel
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Select a filter and numeric column. The client computes the sum locally;
              the server independently verifies it. A <strong style={{ color: '#22c55e' }}>MATCH</strong> badge
              confirms both agree — no mock, no rounding trick.
            </p>
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Filter column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Filter Column
            </label>
            <select
              value={verifyFilterCol}
              onChange={e => { setVerifyFilterCol(e.target.value); setVerifyFilterVal('All'); setVerifyResult(null); }}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}
            >
              <option value="">— None (all rows) —</option>
              {catCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Filter value */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Filter Value
            </label>
            <select
              value={verifyFilterVal}
              onChange={e => { setVerifyFilterVal(e.target.value); setVerifyResult(null); }}
              disabled={!verifyFilterCol}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', padding: '0.45rem 0.7rem', fontSize: '0.85rem', opacity: !verifyFilterCol ? 0.4 : 1 }}
            >
              {filterValues.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Numeric column to sum */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sum Column
            </label>
            <select
              value={verifySumCol}
              onChange={e => { setVerifySumCol(e.target.value); setVerifyResult(null); }}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-main)', padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}
            >
              <option value="">— Select a numeric column —</option>
              {numCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Verify button */}
          <button
            className="button"
            onClick={runVerify}
            disabled={!verifySumCol || verifyLoading}
            style={{ height: '38px', padding: '0 1.2rem', whiteSpace: 'nowrap' }}
          >
            {verifyLoading
              ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</>
              : <><CheckCheck size={14} /> Run Verification</>}
          </button>
        </div>

        {/* Live client sum preview */}
        {clientSum && verifySumCol && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem 1.25rem', flex: 1, minWidth: '180px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Client-Side Sum ({clientSum.count} rows)
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--secondary)' }}>
                {clientSum.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Computed in browser via React useMemo
              </div>
            </div>

            {verifyResult && (
              <>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem 1.25rem', flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Server-Side Sum ({verifyResult.matchedRows} rows)
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
                    {verifyResult.serverSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Computed in Express via Array.reduce on live data
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '120px' }}>
                  {isMatch ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: '#22c55e' }}>
                      <CheckCircle2 size={36} />
                      <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '1px' }}>MATCH</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Δ = {Math.abs(verifyResult.serverSum - clientSum.sum).toFixed(4)}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: '#ef4444' }}>
                      <XCircle size={36} />
                      <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '1px' }}>MISMATCH</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Δ = {Math.abs(verifyResult.serverSum - clientSum.sum).toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Average ROI callout if ROI column found */}
        {columns.roi && (
          <div style={{ padding: '0.65rem 1rem', borderRadius: '8px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.82rem', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CheckCircle2 size={14} />
            <span>
              <strong>ROI Column Detected:</strong> <code style={{ color: 'var(--secondary)' }}>{columns.roi}</code>
              {kpis?.avgRoi && kpis.avgRoi !== 'N/A' && (
                <> — Average Campaign ROI = <strong style={{ color: '#a7f3d0' }}>{kpis.avgRoi}</strong></>
              )}
            </span>
          </div>
        )}

        {verifyError && (
          <div style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.82rem' }}>
            ⚠ {verifyError}
          </div>
        )}
      </div>
    </div>
  );
};

