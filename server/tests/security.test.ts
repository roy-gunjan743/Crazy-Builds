/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  PII SECURITY SHIELD — LIVE INTEGRATION TEST                      ║
 * ║  Sends REAL PII to the server and proves tokenization works.       ║
 * ║  Zero mocks. Every assertion hits localhost:5000 over HTTP.        ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import FormData  from 'form-data';
import fetch     from 'node-fetch';

const BASE = 'http://localhost:5000';

// ─── Test data with KNOWN PII ──────────────────────────────────────────────
const TEST_CSV = `customer_name,email,phone,region,sales_amount,campaign
Alice Johnson,alice@example.com,+1-555-867-5309,North,1200.00,Google PPC
Bob Martinez,bob.m@testcorp.io,+1-555-222-3333,South,850.50,Meta Retargeting
Carol White,carol.white@mail.com,+44-7700-900123,East,2100.75,SEO Organic
Alice Johnson,alice@example.com,+1-555-867-5309,West,995.00,Cold Email
`;

// Known PII values that MUST NOT appear in stored/returned data
const KNOWN_EMAILS = ['alice@example.com', 'bob.m@testcorp.io', 'carol.white@mail.com'];
const KNOWN_PHONES = ['+1-555-867-5309', '+1-555-222-3333', '+44-7700-900123'];
const KNOWN_NAMES  = ['Alice Johnson', 'Bob Martinez', 'Carol White'];

// ─── Test runner ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; detail: string }[] = [];

function assert(name: string, condition: boolean, detail = '') {
  results.push({ name, ok: condition, detail });
  if (condition) passed++;
  else failed++;
}

function contains(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n));
}

// ─── Main test flow ───────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PII SECURITY SHIELD — LIVE INTEGRATION TEST');
  console.log('═'.repeat(60));

  // ── TEST 1: /api/security-status before any upload ──────────────────────
  console.log('\n[1/5] GET /api/security-status ...');
  try {
    const r = await fetch(`${BASE}/api/security-status`);
    const body = await r.json() as any;

    assert('security-status responds 200', r.status === 200, `Got ${r.status}`);
    assert('shieldActive is true', body.shieldActive === true, JSON.stringify(body.shieldActive));
    assert('note mentions heap memory', typeof body.note === 'string' && body.note.includes('heap'), body.note);
  } catch (e: any) {
    assert('security-status reachable', false, e.message);
    assert('shieldActive is true', false, 'request failed');
    assert('note mentions heap memory', false, 'request failed');
  }

  // ── TEST 2: Upload CSV with known PII ────────────────────────────────────
  console.log('\n[2/5] POST /api/upload (CSV with 3 real emails, phones, names) ...');

  // Write temp CSV
  const tmpFile = path.join(os.tmpdir(), `pii_test_${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, TEST_CSV, 'utf-8');

  let uploadBody: any = null;
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'pii_test.csv', contentType: 'text/csv' });

    const r = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form, headers: form.getHeaders() });
    assert('upload responds 200', r.status === 200, `Got ${r.status}`);
    uploadBody = await r.json();
    assert('upload success flag', uploadBody.success === true, JSON.stringify(uploadBody));
  } catch (e: any) {
    assert('upload responds 200', false, e.message);
    assert('upload success flag', false, e.message);
  } finally {
    fs.unlinkSync(tmpFile);
  }

  if (!uploadBody) {
    console.log('\n  ⚠  Upload failed — skipping PII assertion tests\n');
  } else {
    // ── TEST 3: piiReport returned with correct detections ──────────────────
    console.log('\n[3/5] Asserting piiReport from upload response ...');
    const report = uploadBody.piiReport;

    assert('piiReport exists in response', !!report, 'piiReport is null/undefined');
    assert('hasPii = true', report?.hasPii === true, `hasPii = ${report?.hasPii}`);
    assert('at least 3 columns flagged', (report?.flaggedColumns?.length ?? 0) >= 3,
           `flagged: ${report?.flaggedColumns?.map((f: any) => f.columnName).join(', ')}`);

    const flaggedNames = (report?.flaggedColumns ?? []).map((f: any) => f.columnName);
    assert('email column flagged', flaggedNames.some((n: string) => n.toLowerCase().includes('email')),
           `flags: ${flaggedNames.join(', ')}`);
    assert('phone column flagged', flaggedNames.some((n: string) => n.toLowerCase().includes('phone')),
           `flags: ${flaggedNames.join(', ')}`);
    assert('name/customer column flagged',
           flaggedNames.some((n: string) => n.toLowerCase().includes('name') || n.toLowerCase().includes('customer')),
           `flags: ${flaggedNames.join(', ')}`);

    const criticalCount = report?.riskSummary?.critical ?? 0;
    assert('at least 2 critical-risk columns found', criticalCount >= 2, `critical=${criticalCount}`);

    // ── TEST 4: Returned data rows contain TOKENS not raw PII ──────────────
    console.log('\n[4/5] Checking returned data rows — raw PII must NOT appear ...');
    const rows: any[] = uploadBody.data ?? [];

    assert('rows returned from upload', rows.length > 0, `rows.length=${rows.length}`);

    const rowsJson = JSON.stringify(rows);

    // No raw email should survive in the returned masked data
    for (const email of KNOWN_EMAILS) {
      assert(`email "${email}" is NOT in masked data`, !rowsJson.includes(email),
             `LEAK: "${email}" found in response`);
    }

    // No raw phone should survive
    for (const phone of KNOWN_PHONES) {
      assert(`phone "${phone}" is NOT in masked data`, !rowsJson.includes(phone),
             `LEAK: "${phone}" found in response`);
    }

    // Tokens should follow the expected format (EMAIL_00001 etc.)
    const hasEmailToken  = rowsJson.includes('EMAIL_');
    const hasPhoneToken  = rowsJson.includes('PHONE_');
    const hasCustomerTok = rowsJson.includes('CUSTOMER_');
    assert('EMAIL_ tokens present in masked rows', hasEmailToken, 'No EMAIL_ token found');
    assert('PHONE_ tokens present in masked rows', hasPhoneToken, 'No PHONE_ token found');
    assert('CUSTOMER_ tokens present in masked rows', hasCustomerTok, 'No CUSTOMER_ token found');

    // Same real value → same token (deduplication test: Alice appears twice)
    const emailCol = (report?.flaggedColumns ?? []).find((f: any) => f.columnName.toLowerCase().includes('email'))?.columnName;
    if (emailCol) {
      const emailTokens = rows.map((r: any) => r[emailCol]);
      const aliceTokens = emailTokens.filter((t: string) => typeof t === 'string' && t.startsWith('EMAIL_'));
      // Alice's email appears in rows 0 and 3 — both should have the same token
      assert('Same real value → same token (dedup)', aliceTokens[0] === aliceTokens[3],
             `row0="${aliceTokens[0]}" row3="${aliceTokens[3]}"`);
    } else {
      assert('Same real value → same token (dedup)', false, 'email column not found in report');
    }

    // ── TEST 5: /api/security-status after upload ────────────────────────────
    console.log('\n[5/5] GET /api/security-status after upload ...');
    try {
      const r2 = await fetch(`${BASE}/api/security-status`);
      const status = await r2.json() as any;

      assert('post-upload hasPii = true', status.hasPii === true, `hasPii=${status.hasPii}`);
      assert('mappingTableSize > 0', (status.mappingTableSize ?? 0) > 0,
             `mappingTableSize=${status.mappingTableSize}`);
      assert('mappingTable NOT exposed in status', !status.mappingTable || typeof status.mappingTable !== 'object' || Array.isArray(status.mappingTable),
             'Raw mapping table exposed in public endpoint — SECURITY RISK');
    } catch (e: any) {
      assert('post-upload status reachable', false, e.message);
      assert('mappingTableSize > 0', false, e.message);
      assert('mappingTable NOT exposed in status', false, e.message);
    }
  }

  // ─── Print results ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST RESULTS');
  console.log('═'.repeat(60));

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok && r.detail) {
      console.log(`        ↳ ${r.detail}`);
    }
  }

  console.log('═'.repeat(60));
  console.log(`  PASSED : ${passed}/${passed + failed}`);
  console.log(`  FAILED : ${failed}/${passed + failed}`);
  console.log('═'.repeat(60) + '\n');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
