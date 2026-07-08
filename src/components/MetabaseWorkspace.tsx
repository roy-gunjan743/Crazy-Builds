import { useState, useMemo } from 'react';
import { 
  Compass, Database, Copy, Check, Filter, ExternalLink, Info, AlertCircle 
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

interface MetabaseWorkspaceProps {
  data: any[];
  metabaseEmbedUrl: string;
}

const METABASE_COLORS = {
  blue: '#509ee3',
  purple: '#A982F5',
  orange: '#EF9A4A',
  green: '#8BC34A',
  grey: '#64748b'
};

export const MetabaseWorkspace: React.FC<MetabaseWorkspaceProps> = ({ 
  data, 
  metabaseEmbedUrl 
}) => {
  // Collapsible SQL card states
  const [visibleSqlCard, setVisibleSqlCard] = useState<{ [key: string]: boolean }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filter States
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<string>('All');

  // Locate columns
  const columns = useMemo(() => {
    const keys = data.length > 0 ? Object.keys(data[0]) : [];
    const findCol = (terms: string[]) => {
      return keys.find(k => terms.some(term => k.toLowerCase().includes(term))) || '';
    };

    return {
      sales: findCol(['sales', 'revenue', 'income', 'amount']),
      date: findCol(['date', 'time', 'period']),
      region: findCol(['region', 'location', 'country', 'city']),
      product: findCol(['product', 'item', 'category']),
      campaign: findCol(['campaign', 'channel', 'source']),
      spend: findCol(['spend', 'cost', 'budget']),
      roi: findCol(['roi', 'return', 'performance'])
    };
  }, [data]);

  // Extract unique filter dropdown values
  const filterOptions = useMemo(() => {
    const regions = new Set<string>();
    const products = new Set<string>();

    data.forEach(row => {
      if (columns.region && row[columns.region]) regions.add(String(row[columns.region]));
      if (columns.product && row[columns.product]) products.add(String(row[columns.product]));
    });

    return {
      regions: ['All', ...Array.from(regions).sort()],
      products: ['All', ...Array.from(products).sort()]
    };
  }, [data, columns]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchRegion = selectedRegion === 'All' || String(row[columns.region]) === selectedRegion;
      const matchProduct = selectedProduct === 'All' || String(row[columns.product]) === selectedProduct;
      return matchRegion && matchProduct;
    });
  }, [data, selectedRegion, selectedProduct, columns]);

  // Chart 1: Revenue Timeline
  const trendData = useMemo(() => {
    if (!columns.date || !columns.sales) return [];
    
    const groups: { [key: string]: number } = {};
    filteredData.forEach(row => {
      const d = String(row[columns.date]);
      groups[d] = (groups[d] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups).sort().map(date => ({
      name: date,
      value: parseFloat(groups[date].toFixed(2))
    }));
  }, [filteredData, columns]);

  // Chart 2: Regional Performance
  const regionalData = useMemo(() => {
    if (!columns.region || !columns.sales) return [];

    const groups: { [key: string]: number } = {};
    filteredData.forEach(row => {
      const r = String(row[columns.region]);
      groups[r] = (groups[r] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups).map(name => ({
      name,
      value: parseFloat(groups[name].toFixed(2))
    })).sort((a,b) => b.value - a.value);
  }, [filteredData, columns]);

  // Chart 3: Product sales
  const productData = useMemo(() => {
    if (!columns.product || !columns.sales) return [];

    const groups: { [key: string]: number } = {};
    filteredData.forEach(row => {
      const p = String(row[columns.product]);
      groups[p] = (groups[p] || 0) + Number(row[columns.sales] || 0);
    });

    return Object.keys(groups).map(name => ({
      name,
      value: parseFloat(groups[name].toFixed(2))
    })).sort((a,b) => b.value - a.value);
  }, [filteredData, columns]);

  // Chart 4: Campaigns spend and ROI
  const campaignData = useMemo(() => {
    if (!columns.campaign) return [];

    const spendGroups: { [key: string]: number } = {};
    const roiGroups: { [key: string]: { sum: number; count: number } } = {};

    filteredData.forEach(row => {
      const c = String(row[columns.campaign]);
      if (columns.spend) {
        spendGroups[c] = (spendGroups[c] || 0) + Number(row[columns.spend] || 0);
      }
      if (columns.roi) {
        if (!roiGroups[c]) roiGroups[c] = { sum: 0, count: 0 };
        roiGroups[c].sum += Number(row[columns.roi] || 0);
        roiGroups[c].count += 1;
      }
    });

    return Object.keys(spendGroups).map(name => ({
      name,
      Spend: spendGroups[name],
      ROI: roiGroups[name] ? parseFloat((roiGroups[name].sum / roiGroups[name].count).toFixed(2)) : 0
    }));
  }, [filteredData, columns]);

  const toggleSql = (key: string) => {
    setVisibleSqlCard(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (key: string, sqlText: string) => {
    navigator.clipboard.writeText(sqlText);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // SQL Query builders mapped to our SQLite Prisma tables
  const SQL_QUERIES = {
    trend: `SELECT 
  json_extract(dataJson, '$.Date') AS Date, 
  SUM(CAST(json_extract(dataJson, '$.Sales') AS REAL)) AS Total_Sales
FROM DataRow
GROUP BY Date
ORDER BY Date ASC;`,

    region: `SELECT 
  json_extract(dataJson, '$.Region') AS Region, 
  SUM(CAST(json_extract(dataJson, '$.Sales') AS REAL)) AS Total_Sales
FROM DataRow
GROUP BY Region
ORDER BY Total_Sales DESC;`,

    product: `SELECT 
  json_extract(dataJson, '$.Product') AS Product, 
  SUM(CAST(json_extract(dataJson, '$.Sales') AS REAL)) AS Total_Sales
FROM DataRow
GROUP BY Product
ORDER BY Total_Sales DESC;`,

    campaign: `SELECT 
  json_extract(dataJson, '$.Campaign') AS Campaign, 
  SUM(CAST(json_extract(dataJson, '$.Campaign Spend') AS REAL)) AS Total_Spend,
  AVG(CAST(json_extract(dataJson, '$.Campaign ROI') AS REAL)) AS Average_ROI
FROM DataRow
GROUP BY Campaign;`
  };

  // If real Metabase URL is configured, load in full iframe
  if (metabaseEmbedUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
            <Compass size={18} />
            <span>Embedded Metabase Server Dashboard Active</span>
          </div>
          <a href={metabaseEmbedUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none', fontWeight: 600 }}>
            Open in Metabase <ExternalLink size={14} />
          </a>
        </div>
        <div style={{ width: '100%', height: '80vh', border: 'none', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          <iframe 
            src={metabaseEmbedUrl} 
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Metabase Embedded Dashboard"
          />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <AlertCircle size={48} style={{ marginBottom: '1rem', color: 'var(--warning)' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem' }}>No Data for Metabase</h3>
        <p style={{ marginTop: '0.5rem', textAlign: 'center', fontSize: '0.9rem' }}>Please upload your business sheets to populate Metabase SQL query layers.</p>
      </div>
    );
  }

  return (
    <div className="metabase-portal-container">
      {/* Top Navigation Bar */}
      <div className="metabase-navbar">
        <div className="metabase-logo-area">
          <Compass size={22} style={{ fill: 'none' }} />
          <span>Metabase Workspace</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
          <Database size={12} /> Connected: SQLite (Prisma dev.db)
        </div>
      </div>

      {/* Metabase Drop Filters bar */}
      <div className="metabase-filters-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontSize: '0.85rem', fontWeight: 600, marginRight: '1rem' }}>
          <Filter size={14} /> Interactive Filters
        </div>

        {/* Region Filter */}
        {columns.region && (
          <div className="metabase-filter-widget">
            <span className="metabase-filter-label">Region</span>
            <select 
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="metabase-filter-select"
            >
              {filterOptions.regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        {/* Product Filter */}
        {columns.product && (
          <div className="metabase-filter-widget">
            <span className="metabase-filter-label">Product SKU</span>
            <select 
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="metabase-filter-select"
            >
              {filterOptions.products.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Dashboard Space */}
      <div className="metabase-dashboard-content">
        {/* SQL Help Notification */}
        <div style={{ background: 'rgba(80, 158, 227, 0.05)', border: '1px solid rgba(80, 158, 227, 0.15)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: '#334155', lineHeight: 1.4 }}>
          <Info size={16} style={{ color: '#509ee3', flexShrink: 0, marginTop: '2px' }} />
          <span>
            <strong>Metabase SQL Portal</strong>: The cards below represent Metabase cards. Click <strong>{`{ SQL }`}</strong> in the corner of any card to view and copy the raw SQLite statement executed against the database `dev.db` to pull that data structure.
          </span>
        </div>

        <div className="metabase-grid-3">
          {/* Card 1: Revenue trend */}
          {trendData.length > 0 && (
            <div className="metabase-card">
              <div>
                <div className="metabase-card-header">
                  <span className="metabase-card-title">Daily Sales Trend Revenue</span>
                  <button className="metabase-sql-toggle-btn" onClick={() => toggleSql('trend')}>
                    {`{ SQL }`}
                  </button>
                </div>

                <div className="metabase-chart-container">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                      <Line type="monotone" dataKey="value" stroke={METABASE_COLORS.blue} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {visibleSqlCard.trend && (
                <div className="metabase-sql-console">
                  <div className="metabase-sql-console-header">
                    <span>SQLite Query</span>
                    <button className="metabase-sql-btn-copy" onClick={() => handleCopy('trend', SQL_QUERIES.trend)}>
                      {copiedKey === 'trend' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="metabase-sql-code"><code>{SQL_QUERIES.trend}</code></pre>
                </div>
              )}
            </div>
          )}

          {/* Card 2: Regions breakdown */}
          {regionalData.length > 0 && (
            <div className="metabase-card">
              <div>
                <div className="metabase-card-header">
                  <span className="metabase-card-title">Revenue Share by Region</span>
                  <button className="metabase-sql-toggle-btn" onClick={() => toggleSql('region')}>
                    {`{ SQL }`}
                  </button>
                </div>

                <div className="metabase-chart-container">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={regionalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                      <Bar dataKey="value" fill={METABASE_COLORS.purple} radius={[3, 3, 0, 0]} barSize={35} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {visibleSqlCard.region && (
                <div className="metabase-sql-console">
                  <div className="metabase-sql-console-header">
                    <span>SQLite Query</span>
                    <button className="metabase-sql-btn-copy" onClick={() => handleCopy('region', SQL_QUERIES.region)}>
                      {copiedKey === 'region' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="metabase-sql-code"><code>{SQL_QUERIES.region}</code></pre>
                </div>
              )}
            </div>
          )}

          {/* Card 3: Product mix */}
          {productData.length > 0 && (
            <div className="metabase-card">
              <div>
                <div className="metabase-card-header">
                  <span className="metabase-card-title">Sales Mix by Product Category</span>
                  <button className="metabase-sql-toggle-btn" onClick={() => toggleSql('product')}>
                    {`{ SQL }`}
                  </button>
                </div>

                <div className="metabase-chart-container">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={productData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                      <Bar dataKey="value" fill={METABASE_COLORS.green} radius={[3, 3, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {visibleSqlCard.product && (
                <div className="metabase-sql-console">
                  <div className="metabase-sql-console-header">
                    <span>SQLite Query</span>
                    <button className="metabase-sql-btn-copy" onClick={() => handleCopy('product', SQL_QUERIES.product)}>
                      {copiedKey === 'product' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="metabase-sql-code"><code>{SQL_QUERIES.product}</code></pre>
                </div>
              )}
            </div>
          )}

          {/* Card 4: Campaigns spend */}
          {campaignData.length > 0 && (
            <div className="metabase-card">
              <div>
                <div className="metabase-card-header">
                  <span className="metabase-card-title">Marketing Channels Spend Performance</span>
                  <button className="metabase-sql-toggle-btn" onClick={() => toggleSql('campaign')}>
                    {`{ SQL }`}
                  </button>
                </div>

                <div className="metabase-chart-container">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={campaignData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '0.65rem' }} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                      <Bar dataKey="Spend" fill={METABASE_COLORS.orange} radius={[3, 3, 0, 0]} barSize={25} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {visibleSqlCard.campaign && (
                <div className="metabase-sql-console">
                  <div className="metabase-sql-console-header">
                    <span>SQLite Query</span>
                    <button className="metabase-sql-btn-copy" onClick={() => handleCopy('campaign', SQL_QUERIES.campaign)}>
                      {copiedKey === 'campaign' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="metabase-sql-code"><code>{SQL_QUERIES.campaign}</code></pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
