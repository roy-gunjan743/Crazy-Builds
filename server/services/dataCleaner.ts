export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'date' | 'boolean' | 'categorical' | 'text';
  missingCount: number;
  uniqueCount: number;
  sampleValues: any[];
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
}

export interface CleanedDataset {
  raw: any[];
  cleaned: any[];
  profiles: ColumnProfile[];
}

export function profileDataset(data: any[]): ColumnProfile[] {
  if (!data || data.length === 0) return [];

  const keys = Object.keys(data[0]);
  const profiles: ColumnProfile[] = [];

  for (const key of keys) {
    const values = data.map(row => row[key]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

    const missingCount = data.length - nonNullValues.length;
    const uniqueCount = new Set(nonNullValues).size;
    const sampleValues = nonNullValues.slice(0, 5);

    let type: ColumnProfile['type'] = 'text';
    if (nonNullValues.length > 0) {
      const numericMatches = nonNullValues.filter(v => {
        if (typeof v === 'number') return true;
        if (typeof v === 'string') {
          const parsed = Number(v.replace(/[\$,%]/g, ''));
          return !isNaN(parsed) && v.trim() !== '';
        }
        return false;
      });

      const dateMatches = nonNullValues.filter(v => {
        if (v instanceof Date) return true;
        if (typeof v === 'string') {
          if (/^\d+$/.test(v.trim())) return false;
          const timestamp = Date.parse(v);
          return !isNaN(timestamp) && v.length > 6;
        }
        return false;
      });

      const booleanMatches = nonNullValues.filter(v => {
        if (typeof v === 'boolean') return true;
        if (typeof v === 'string') {
          const lower = v.trim().toLowerCase();
          return lower === 'true' || lower === 'false' || lower === 'yes' || lower === 'no';
        }
        return false;
      });

      if (numericMatches.length / nonNullValues.length > 0.85) {
        type = 'numeric';
      } else if (dateMatches.length / nonNullValues.length > 0.85) {
        type = 'date';
      } else if (booleanMatches.length / nonNullValues.length > 0.85) {
        type = 'boolean';
      } else if (uniqueCount < 20 || uniqueCount / data.length < 0.2) {
        type = 'categorical';
      }
    }

    const profile: ColumnProfile = {
      name: key,
      type,
      missingCount,
      uniqueCount,
      sampleValues,
    };

    if (type === 'numeric' && nonNullValues.length > 0) {
      const numValues = nonNullValues.map(v => {
        if (typeof v === 'number') return v;
        return Number(String(v).replace(/[\$,%]/g, ''));
      }).filter(v => !isNaN(v));

      if (numValues.length > 0) {
        numValues.sort((a, b) => a - b);
        const sum = numValues.reduce((a, b) => a + b, 0);
        profile.min = numValues[0];
        profile.max = numValues[numValues.length - 1];
        profile.mean = parseFloat((sum / numValues.length).toFixed(2));
        
        const mid = Math.floor(numValues.length / 2);
        profile.median = numValues.length % 2 !== 0 
          ? numValues[mid] 
          : parseFloat(((numValues[mid - 1] + numValues[mid]) / 2).toFixed(2));
      }
    } else if (type === 'date' && nonNullValues.length > 0) {
      const dates = nonNullValues
        .map(v => (v instanceof Date ? v : new Date(v)))
        .filter(d => !isNaN(d.getTime()));
      
      if (dates.length > 0) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        profile.min = dates[0].toISOString().split('T')[0];
        profile.max = dates[dates.length - 1].toISOString().split('T')[0];
      }
    }

    profiles.push(profile);
  }

  return profiles;
}

export function cleanDataset(data: any[], profiles: ColumnProfile[]): any[] {
  return data.map(row => {
    const cleanRow = { ...row };
    for (const profile of profiles) {
      const val = cleanRow[profile.name];
      
      if (val === null || val === undefined || val === '') {
        if (profile.type === 'numeric') {
          cleanRow[profile.name] = profile.mean !== undefined ? profile.mean : 0;
        } else if (profile.type === 'boolean') {
          cleanRow[profile.name] = false;
        } else {
          cleanRow[profile.name] = 'N/A';
        }
      } else {
        if (profile.type === 'numeric') {
          if (typeof val === 'string') {
            const parsed = Number(val.replace(/[\$,%]/g, ''));
            cleanRow[profile.name] = isNaN(parsed) ? (profile.mean || 0) : parsed;
          } else {
            cleanRow[profile.name] = val;
          }
        } else if (profile.type === 'boolean') {
          if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            cleanRow[profile.name] = lower === 'true' || lower === 'yes';
          } else {
            cleanRow[profile.name] = Boolean(val);
          }
        } else if (profile.type === 'date') {
          const dateObj = new Date(val);
          cleanRow[profile.name] = !isNaN(dateObj.getTime()) 
            ? dateObj.toISOString().split('T')[0] 
            : String(val);
        } else {
          cleanRow[profile.name] = String(val).trim();
        }
      }
    }
    return cleanRow;
  });
}
