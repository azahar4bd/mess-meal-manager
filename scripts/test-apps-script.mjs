/**
 * Local simulator for google-apps-script/Code.gs.
 *
 * It implements just enough of the Apps Script runtime (SpreadsheetApp,
 * ContentService, LockService, Logger), loads the REAL Code.gs unchanged, and
 * drives it with a REAL payload produced by the running Next.js app — so the
 * tab names, headers and cell types that land in the fake spreadsheet are
 * exactly what a deployed script would write to Google Sheets.
 *
 * Run: node scripts/test-apps-script.mjs   (server must be running on :3000)
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'google-apps-script/Code.gs'), 'utf8');

/* ── fake Spreadsheet runtime ─────────────────────────────────────── */
class Range {
  constructor(sheet, row, col, rows, cols) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  setValues(values) {
    for (let i = 0; i < values.length; i++) {
      const r = this.row - 1 + i;
      while (this.sheet.data.length <= r) this.sheet.data.push([]);
      for (let c = 0; c < values[i].length; c++) this.sheet.data[r][this.col - 1 + c] = values[i][c];
    }
    return this;
  }
  getValues() {
    return this.sheet.data.slice(this.row - 1, this.row - 1 + this.rows).map((r) => r.slice(this.col - 1, this.col - 1 + this.cols));
  }
  setFontWeight() { return this; }
  setNumberFormat(fmt) { this.sheet.formats.push(fmt); return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.frozen = 0; this.formats = []; this.resized = 0; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { return new Range(this, 1, 1, this.data.length, this.getLastColumn()); }
  clear() { this.data = []; }
  clearContents() { this.data = this.data.map((r, i) => (i === 0 ? r : r.map(() => ''))); }
  setFrozenRows(n) { this.frozen = n; }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  autoResizeColumns(_start, count) { this.resized = count; }
  appendRow(row) { this.data.push(row.slice()); }
  deleteRow(n) { this.data.splice(n - 1, 1); }
  getLastUpdated() { return new Date('2026-09-13T10:00:00Z'); }
}

class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = []; this.locale = 'en_US'; this.deleted = []; }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.getName() === n) ?? null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.deleted.push(s.getName()); this.sheets = this.sheets.filter((x) => x !== s); }
  setSpreadsheetLocale(l) { this.locale = l; }
  setActiveSheet() {}
  moveActiveSheetTo(pos) { const s = this.sheets.pop(); this.sheets.splice(pos - 1, 0, s); }
}

let SPREADSHEET = null;
const SpreadsheetApp = {
  getActiveSpreadsheet: () => SPREADSHEET,
  openById: () => SPREADSHEET,
  create: (name) => { SPREADSHEET = new Spreadsheet(`id-${Date.now()}`, name); return SPREADSHEET; },
};
const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: (text) => ({ setMimeType() { this.getContent = () => text; return this; } }),
};
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const logs = [];
const Logger = { log: (...args) => logs.push(args.join(' ')) };

const api = new Function('SpreadsheetApp', 'ContentService', 'LockService', 'Logger', `${SRC}\nreturn { doGet, doPost, setupTabs, setupCreateSpreadsheet, testRunSync, TABS, TAB_ORDER };`)(
  SpreadsheetApp, ContentService, LockService, Logger,
);

const post = (body) => JSON.parse(api.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }).getContent());
const postRaw = (text) => JSON.parse(api.doPost({ parameter: {}, postData: { contents: text } }).getContent());
const get = (query) => JSON.parse(api.doGet({ parameter: query }).getContent());

/* ── tiny test harness ────────────────────────────────────────────── */
let pass = 0, fail = 0;
const failures = [];
function check(name, condition, extra = '') {
  if (condition) { pass++; console.log('  ✓', name); }
  else { fail++; failures.push(name); console.log('  ✗', name, extra); }
}

/* ── pull a real payload out of the running app ───────────────────── */
async function realPayload() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '01711111111', password: 'manager123' }),
  });
  if (!login.ok) throw new Error(`login failed (${login.status}) — is the server running and seeded?`);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const res = await fetch(`${BASE}/api/mess`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'sheet.payload' }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`sheet.payload failed: ${JSON.stringify(body).slice(0, 200)}`);
  // /api/mess wraps the handler result, and the SyncPayload itself carries an
  // `action` + `data` envelope (that envelope is what Apps Script receives).
  const unwrapped = body.data?.data ?? body.data;
  if (!unwrapped?.sheets) throw new Error('payload has no sheets[]');
  return unwrapped;
}

const payload = await realPayload();
const byName = Object.fromEntries(payload.sheets.map((s) => [s.name, s]));
console.log(`   real payload: office=${payload.office?.name} month=${payload.month?.name} tabs=${payload.sheets.length} rows=${payload.sheets.reduce((n, s) => n + s.rows.length, 0)}\n`);

/* ── 1. ping before any sync ──────────────────────────────────────── */
SPREADSHEET = new Spreadsheet('1AbCdEfGhIjK', 'Mess Meal Manager - Gobra');
console.log('1) GET ?action=ping (empty spreadsheet)');
const ping0 = get({ action: 'ping' });
check('ping returns ok:true', ping0.ok === true, JSON.stringify(ping0).slice(0, 160));
check('ping reports the spreadsheet id + url', ping0.spreadsheetId === '1AbCdEfGhIjK' && /docs\.google\.com/.test(ping0.spreadsheetUrl ?? ''));
check('ping lists all 8 tabs as missing', (ping0.missingTabs ?? []).length === 8, JSON.stringify(ping0.missingTabs));

/* ── 2. full sync (spec §57–59) ───────────────────────────────────── */
console.log('\n2) POST action=sync — full rewrite');
const sync = post({ ...payload, action: 'sync' });
check('sync returns ok:true', sync.ok === true, JSON.stringify(sync).slice(0, 240));
check('message = "Google Sheets full sync OK" (what the app expects)', String(sync.message).includes('Google Sheets full sync OK'), sync.message);
check('response carries sheetUrl + sheetId + syncedAt', !!sync.sheetUrl && !!sync.sheetId && !!sync.syncedAt);
check('all 8 tabs reported as written', (sync.tabs ?? []).length === 8, JSON.stringify(sync.tabs));
check('totalRows matches the payload', sync.totalRows === payload.sheets.reduce((n, s) => n + s.rows.length, 0), String(sync.totalRows));

/* ── 3. exact tab structure ───────────────────────────────────────── */
console.log('\n3) Tab names, order and headers (spec §46)');
const names = SPREADSHEET.getSheets().map((s) => s.getName()).filter((n) => n !== '99_সিংক_লগ');
check('tab names AND order match the spec exactly', JSON.stringify(names) === JSON.stringify(api.TAB_ORDER), names.join(' | '));
for (const block of payload.sheets) {
  const sheet = SPREADSHEET.getSheetByName(block.name);
  const header = sheet?.data[0] ?? [];
  check(`${block.name} → header row identical to the app payload`, JSON.stringify(header) === JSON.stringify(block.headers), `sheet=${JSON.stringify(header)}\n     payload=${JSON.stringify(block.headers)}`);
  check(`${block.name} → ${block.rows.length} data rows written`, sheet.getLastRow() - 1 === block.rows.length, `got ${sheet.getLastRow() - 1}`);
  check(`${block.name} → header row frozen`, sheet.frozen === 1, String(sheet.frozen));
}

/* ── 4. cell types ────────────────────────────────────────────────── */
console.log('\n4) Cell types (ids as text, numbers as numbers)');
const meals = SPREADSHEET.getSheetByName('02_দৈনিক_মিল_খাতা');
const mh = meals.data[0];
const mealCol = mh.indexOf('Meals');
const memberIdCol = mh.indexOf('MemberID');
check('Meals written as a NUMBER (Sheets can SUM it)', typeof meals.data[1][mealCol] === 'number', `${typeof meals.data[1][mealCol]} = ${JSON.stringify(meals.data[1][mealCol])}`);
check('MemberID written as TEXT (phone-like ids never truncated)', typeof meals.data[1][memberIdCol] === 'string', typeof meals.data[1][memberIdCol]);
const members = SPREADSHEET.getSheetByName('01_সদস্য_তালিকা');
const activeCol = members.data[0].indexOf('IsActive');
check('"TRUE"/"FALSE" text written as a real BOOLEAN', typeof members.data[1][activeCol] === 'boolean', `${typeof members.data[1][activeCol]} = ${JSON.stringify(members.data[1][activeCol])}`);
const phoneCol = members.data[0].indexOf('Phone');
check('Phone written as TEXT', typeof members.data[1][phoneCol] === 'string', typeof members.data[1][phoneCol]);
const summary = SPREADSHEET.getSheetByName('06_হিসাব_সামারি');
const rateCol = summary.data[0].indexOf('MealRate');
check('MealRate written as a NUMBER', typeof summary.data[1][rateCol] === 'number', `${typeof summary.data[1][rateCol]} = ${summary.data[1][rateCol]}`);
check('money/meal columns get a 2-decimal display format', meals.formats.length > 0, `formats=${meals.formats.length}`);

/* ── 5. idempotency ───────────────────────────────────────────────── */
console.log('\n5) Re-sync is idempotent (full rewrite, no duplication)');
const before = meals.getLastRow();
const sync2 = post({ ...payload, action: 'sync' });
check('second sync also ok:true', sync2.ok === true);
check('meal row count unchanged', meals.getLastRow() === before, `${before} → ${meals.getLastRow()}`);
check('summary still has exactly 1 data row', summary.getLastRow() === 2, String(summary.getLastRow()));
const logSheet = SPREADSHEET.getSheetByName('99_সিংক_লগ');
check('99_সিংক_লগ recorded both syncs', logSheet.getLastRow() === 3, `rows=${logSheet.getLastRow() - 1}`);
check('sync log columns present', JSON.stringify(logSheet.data[0]) === JSON.stringify(['SyncedAt', 'OfficeID', 'OfficeName', 'MonthID', 'MonthName', 'Tabs', 'Rows', 'DurationMs', 'OK', 'Message']), JSON.stringify(logSheet.data[0]));

/* ── 6. pull ──────────────────────────────────────────────────────── */
console.log('\n6) GET ?action=pull&sheetName=Meals');
const pulled = get({ action: 'pull', sheetName: 'Meals' });
check('logical alias "Meals" resolves to the Bangla tab', pulled.sheetName === '02_দৈনিক_মিল_খাতা', pulled.sheetName);
check('pull returns headers + all rows', pulled.headers.length === mh.length && pulled.rowCount === before - 1, `rowCount=${pulled.rowCount}`);
check('pull round-trips the exact cell values', JSON.stringify(pulled.rows[0]) === JSON.stringify(meals.data[1]), JSON.stringify(pulled.rows[0]));
check('?action=tabs lists every tab with row counts', (get({ action: 'tabs' }).tabs ?? []).length === 9);

/* ── 7. incremental actions ───────────────────────────────────────── */
console.log('\n7) pushRows / upsertById / deleteById / replaceSheet');
const bazar = SPREADSHEET.getSheetByName('03_বাজার_খরচ');
const bh = bazar.data[0];
const bazarBefore = bazar.getLastRow();
const testValues = Object.fromEntries(bh.map((h) => [h, '']));
testValues[bh[0]] = 'bz-test-1';                       // EntryID
if (bh.includes('Amount')) testValues.Amount = 120;
if (bh.includes('Date')) testValues.Date = '2026-09-10';
const itemCol = bh.find((h) => /^Item/i.test(h));
if (itemCol) testValues[itemCol] = 'Test item';
const testRow = testValues;
const pushed = post({ action: 'pushRows', sheetName: 'Bazar', rows: [bh.map((h) => testRow[h])] });
check('pushRows appends one row', pushed.ok === true && pushed.appended === 1 && bazar.getLastRow() === bazarBefore + 1, JSON.stringify(pushed).slice(0, 140));
check('pushed row is readable at the bottom', bazar.data[bazar.getLastRow() - 1][0] === 'bz-test-1');

const updated = { ...testRow, Amount: 999 };
if (itemCol) updated[itemCol] = 'Test item UPDATED';
const up = post({ action: 'upsertById', sheetName: 'Bazar', idColumn: bh[0], row: updated });
check('upsertById updates in place (row count unchanged)', up.ok === true && bazar.getLastRow() === bazarBefore + 1, JSON.stringify(up).slice(0, 160));
const lastRow = bazar.data[bazar.getLastRow() - 1];
check('updated cells landed in the right columns', (!itemCol || lastRow[bh.indexOf(itemCol)] === 'Test item UPDATED') && lastRow[bh.indexOf('Amount')] === 999, JSON.stringify(lastRow));
check('upsertById of an unknown id INSERTS instead', post({ action: 'upsertById', sheetName: 'Bazar', idColumn: bh[0], row: { ...updated, [bh[0]]: 'bz-test-2' } }).ok === true && bazar.getLastRow() === bazarBefore + 2);

const del = post({ action: 'deleteById', sheetName: 'Bazar', idColumn: bh[0], id: 'bz-test-1' });
check('deleteById removes exactly one row', del.ok === true && del.deleted === 1 && bazar.getLastRow() === bazarBefore + 1, JSON.stringify(del));
check('deleted row is really gone', !bazar.data.some((r) => r[0] === 'bz-test-1'));
post({ action: 'deleteById', sheetName: 'Bazar', idColumn: bh[0], id: 'bz-test-2' });
check('sheet restored to its synced state', bazar.getLastRow() === bazarBefore, String(bazar.getLastRow()));

const income = SPREADSHEET.getSheetByName('05_অন্যান্য_আয়');
const replaced = post({ action: 'replaceSheet', sheetName: 'Income', headers: income.data[0], rows: [income.data[0].map((h, i) => (i === 0 ? 'in-only' : h === 'Amount' ? 500 : ''))] });
check('replaceSheet rewrites the whole tab', replaced.ok === true && income.getLastRow() === 2, JSON.stringify(replaced).slice(0, 140));

/* ── 8. error handling ────────────────────────────────────────────── */
console.log('\n8) Error handling (never throws raw, always JSON)');
check('unknown action → ok:false with a message', post({ action: 'nonsense' }).ok === false && !!post({ action: 'nonsense' }).error);
check('sync without sheets[] → ok:false', post({ action: 'sync' }).ok === false);
check('malformed JSON body → ok:false (no crash)', postRaw('{oops').ok === false);
check('deleteById without id → ok:false', post({ action: 'deleteById', sheetName: 'Bazar', idColumn: 'EntryID' }).ok === false);
check('upsertById with a wrong idColumn → ok:false', post({ action: 'upsertById', sheetName: 'Bazar', idColumn: 'Nope', row: {} }).ok === false);
check('pull of an unknown tab creates it instead of failing', get({ action: 'pull', sheetName: 'Custom' }).ok === true);
check('every response is valid JSON with an ok flag', [post({ action: 'ping' }), get({ action: 'ping' })].every((r) => typeof r.ok === 'boolean'));

/* ── 9. setup helpers ─────────────────────────────────────────────── */
console.log('\n9) One-time setup helpers');
SPREADSHEET = new Spreadsheet('fresh-id', 'Fresh');
SPREADSHEET.sheets = [];
api.setupTabs();
check('setupTabs() creates all 8 tabs in order', JSON.stringify(SPREADSHEET.getSheets().map((s) => s.getName())) === JSON.stringify(api.TAB_ORDER), SPREADSHEET.getSheets().map((s) => s.getName()).join(' | '));
SPREADSHEET = null;
const created = api.setupCreateSpreadsheet();
check('setupCreateSpreadsheet() creates a spreadsheet + returns id/url', !!created.id && /docs\.google\.com/.test(created.url), JSON.stringify(created));
api.testRunSync();
check('testRunSync() writes its demo tabs', SPREADSHEET.getSheetByName('06_হিসাব_সামারি').getLastRow() === 2);

/* ── 10. optional shared secret ───────────────────────────────────── */
console.log('\n10) Optional API_TOKEN');
const withToken = new Function('SpreadsheetApp', 'ContentService', 'LockService', 'Logger', `${SRC.replace("API_TOKEN: ''", "API_TOKEN: 's3cret'")}\nreturn { doGet, doPost };`)(SpreadsheetApp, ContentService, LockService, Logger);
SPREADSHEET = new Spreadsheet('tok-id', 'Token');
const noToken = JSON.parse(withToken.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'ping' }) } }).getContent());
check('request without the token is rejected', noToken.ok === false, JSON.stringify(noToken).slice(0, 120));
const goodToken = JSON.parse(withToken.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'ping', token: 's3cret' }) } }).getContent());
check('request with the token succeeds', goodToken.ok === true, JSON.stringify(goodToken).slice(0, 120));
const queryToken = JSON.parse(withToken.doGet({ parameter: { action: 'ping', token: 's3cret' } }).getContent());
check('?token=… works for GET too', queryToken.ok === true);

console.log(`\n═══ Apps Script simulation: ${pass} passed, ${fail} failed ═══`);
if (fail) console.log('\nFailures:\n  • ' + failures.join('\n  • '));
process.exit(fail ? 1 : 0);
