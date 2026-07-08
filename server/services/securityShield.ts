/**
 * PII Security Shield — Server-side Scanner & Tokenizer
 *
 * Runs entirely on the backend, NEVER sends raw PII to any LLM.
 * The mappingTable lives only in Node.js heap memory for the session lifetime.
 */

// ─── Regex pattern bank ───────────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX  = /^[+]?[(]?[0-9]{1,4}[)]?[\s.\-]?[(]?[0-9]{1,4}[)]?[\s.\-]?[0-9]{3,6}[\s.\-]?[0-9]{2,6}$/;
const SSN_REGEX    = /^\d{3}-\d{2}-\d{4}$/;
const CARD_REGEX   = /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/;
const IP_REGEX     = /^(\d{1,3}\.){3}\d{1,3}$/;

// Header keywords that strongly suggest PII
const PII_HEADER_PATTERNS = [
  'name', 'fullname', 'first_name', 'last_name', 'firstname', 'lastname',
  'customer', 'employee', 'person', 'user', 'client', 'contact',
  'email', 'e-mail', 'mail',
  'phone', 'mobile', 'cell', 'telephone', 'fax',
  'address', 'street', 'city', 'zipcode', 'postcode', 'location',
  'ssn', 'social_security', 'national_id', 'passport', 'license',
  'account', 'credit_card', 'card_number', 'account_number',
  'dob', 'birthday', 'birth_date', 'date_of_birth', 'age',
  'gender', 'sex', 'nationality', 'race', 'religion',
  'salary', 'income', 'wage', 'compensation'
];

// ─── Public Types ─────────────────────────────────────────────────────────────

export type PiiType = 'email' | 'phone' | 'name' | 'address' | 'id_number' | 'financial' | 'ssn' | 'ip' | 'unknown_pii';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PiiColumnFlag {
  columnName: string;
  piiType: PiiType;
  risk: RiskLevel;
  detectionMethod: 'header_match' | 'value_scan' | 'both';
  sampleMatchCount: number;
  totalRows: number;
  tokenPrefix: string;
}

export interface PiiReport {
  scannedAt: string;
  totalColumns: number;
  flaggedColumns: PiiColumnFlag[];
  hasPii: boolean;
  riskSummary: { critical: number; high: number; medium: number; low: number };
}

export interface ShieldResult {
  maskedData: any[];
  piiReport: PiiReport;
  /** In-memory token ↔ real-value map. NEVER expose this to LLM or write to disk. */
  mappingTable: Map<string, string>;
  maskedColumnNames: Set<string>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function detectPiiTypeFromHeader(header: string): { piiType: PiiType; risk: RiskLevel; prefix: string } | null {
  const h = header.toLowerCase().replace(/[\s_\-]/g, '');

  if (h.includes('email') || h.includes('mail')) return { piiType: 'email', risk: 'critical', prefix: 'EMAIL' };
  if (h.includes('phone') || h.includes('mobile') || h.includes('cell') || h.includes('telephone'))
    return { piiType: 'phone', risk: 'critical', prefix: 'PHONE' };
  if (h.includes('ssn') || h.includes('socialsecurity') || h.includes('nationalid'))
    return { piiType: 'ssn', risk: 'critical', prefix: 'SSN' };
  if (h.includes('creditcard') || h.includes('cardnumber') || h.includes('accountnumber'))
    return { piiType: 'financial', risk: 'critical', prefix: 'CARD' };
  if (h.includes('name') || h.includes('customer') || h.includes('employee') ||
      h.includes('person') || h.includes('client') || h.includes('contact') || h.includes('user'))
    return { piiType: 'name', risk: 'high', prefix: 'CUSTOMER' };
  if (h.includes('address') || h.includes('street') || h.includes('city') ||
      h.includes('zipcode') || h.includes('postcode'))
    return { piiType: 'address', risk: 'high', prefix: 'ADDRESS' };
  if (h.includes('salary') || h.includes('income') || h.includes('wage'))
    return { piiType: 'financial', risk: 'medium', prefix: 'SALARY' };
  if (h.includes('dob') || h.includes('birthday') || h.includes('birthdate'))
    return { piiType: 'id_number', risk: 'medium', prefix: 'DOB' };

  // Loose match against PII_HEADER_PATTERNS
  for (const pattern of PII_HEADER_PATTERNS) {
    if (h.includes(pattern.replace(/[\s_\-]/g, ''))) {
      return { piiType: 'unknown_pii', risk: 'low', prefix: 'PII' };
    }
  }
  return null;
}

function detectPiiTypeFromValue(value: string): { piiType: PiiType; risk: RiskLevel; prefix: string } | null {
  const v = String(value).trim();
  if (EMAIL_REGEX.test(v)) return { piiType: 'email', risk: 'critical', prefix: 'EMAIL' };
  if (PHONE_REGEX.test(v) && v.replace(/\D/g, '').length >= 10)
    return { piiType: 'phone', risk: 'critical', prefix: 'PHONE' };
  if (SSN_REGEX.test(v)) return { piiType: 'ssn', risk: 'critical', prefix: 'SSN' };
  if (CARD_REGEX.test(v)) return { piiType: 'financial', risk: 'critical', prefix: 'CARD' };
  if (IP_REGEX.test(v)) return { piiType: 'ip', risk: 'medium', prefix: 'IP' };
  return null;
}

function zeroPad(n: number): string {
  return String(n).padStart(5, '0');
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Scans `data`, flags PII columns, replaces real values with stable tokens.
 * Returns masked rows + a report + the in-memory mapping table.
 *
 * The caller MUST keep `mappingTable` in server heap memory only
 * and purge it on session end / server restart.
 */
export function runPiiShield(data: any[]): ShieldResult {
  if (!data || data.length === 0) {
    return {
      maskedData: [],
      piiReport: {
        scannedAt: new Date().toISOString(),
        totalColumns: 0,
        flaggedColumns: [],
        hasPii: false,
        riskSummary: { critical: 0, high: 0, medium: 0, low: 0 }
      },
      mappingTable: new Map(),
      maskedColumnNames: new Set()
    };
  }

  const columns = Object.keys(data[0]);
  const flagged: PiiColumnFlag[] = [];
  const columnMeta: Map<string, { piiType: PiiType; risk: RiskLevel; prefix: string; detectionMethod: 'header_match' | 'value_scan' | 'both' }> = new Map();

  // ── Phase 1: Header scan ───────────────────────────────────────────────────
  for (const col of columns) {
    const headerHit = detectPiiTypeFromHeader(col);
    if (headerHit) {
      columnMeta.set(col, { ...headerHit, detectionMethod: 'header_match' });
    }
  }

  // ── Phase 2: Value scan (sample up to 50 rows per column) ─────────────────
  const sampleSize = Math.min(data.length, 50);
  for (const col of columns) {
    let hits = 0;
    for (let r = 0; r < sampleSize; r++) {
      const cell = data[r][col];
      if (cell === null || cell === undefined || cell === '') continue;
      const valueHit = detectPiiTypeFromValue(String(cell));
      if (valueHit) {
        hits++;
        const existing = columnMeta.get(col);
        if (!existing) {
          columnMeta.set(col, { ...valueHit, detectionMethod: 'value_scan' });
        } else if (existing.detectionMethod === 'header_match') {
          columnMeta.set(col, { ...existing, detectionMethod: 'both' });
        }
      }
    }

    const meta = columnMeta.get(col);
    if (meta) {
      flagged.push({
        columnName: col,
        piiType: meta.piiType,
        risk: meta.risk,
        detectionMethod: meta.detectionMethod,
        sampleMatchCount: hits,
        totalRows: data.length,
        tokenPrefix: meta.prefix
      });
    }
  }

  // ── Phase 3: Tokenisation ─────────────────────────────────────────────────
  // mappingTable: "TOKEN_XXXXX" → "real_value"
  const mappingTable = new Map<string, string>();
  // Reverse map so the same real value always gets the same token within this session
  const reverseMap = new Map<string, string>();
  let tokenCounter = 1;

  const maskedData = data.map((row: any) => {
    const newRow: any = { ...row };
    for (const flag of flagged) {
      const col = flag.columnName;
      const rawValue = row[col];
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;

      const key = `${flag.tokenPrefix}||${String(rawValue)}`;
      let token = reverseMap.get(key);
      if (!token) {
        token = `${flag.tokenPrefix}_${zeroPad(tokenCounter++)}`;
        reverseMap.set(key, token);
        mappingTable.set(token, String(rawValue));
      }
      newRow[col] = token;
    }
    return newRow;
  });

  // ── Phase 4: Risk summary ─────────────────────────────────────────────────
  const riskSummary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of flagged) riskSummary[f.risk]++;

  const piiReport: PiiReport = {
    scannedAt: new Date().toISOString(),
    totalColumns: columns.length,
    flaggedColumns: flagged,
    hasPii: flagged.length > 0,
    riskSummary
  };

  return {
    maskedData,
    piiReport,
    mappingTable,
    maskedColumnNames: new Set(flagged.map(f => f.columnName))
  };
}

/**
 * Replaces tokens found in an LLM text response with their real values
 * from the in-memory mapping table — done entirely server-side,
 * before the answer reaches the frontend.
 */
export function unmaskText(text: string, mappingTable: Map<string, string>): string {
  let result = text;
  for (const [token, realValue] of mappingTable.entries()) {
    // Escape regex special chars in the token string
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), realValue);
  }
  return result;
}
