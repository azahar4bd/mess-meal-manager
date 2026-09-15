/**
 * ══════════════════════════════════════════════════════════════════════════
 *  Mess Meal Manager — Google Apps Script sync endpoint
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Next.js application ──POST JSON──▶ Apps Script Web App ──▶ Google Spreadsheet
 *
 *  Deploy:
 *    1. Open (or create) the spreadsheet for one office, e.g.
 *       "Mess Meal Manager - Gobra".
 *    2. Extensions → Apps Script → paste this whole file into Code.gs.
 *    3. Set SPREADSHEET_ID below (or leave "" to auto-bind to the container
 *       spreadsheet), or run setupCreateSpreadsheet() once to create a new one.
 *    4. Deploy → New deployment → Web app
 *         Execute as : Me
 *         Who has access : Anyone
 *    5. Copy the /exec URL into the app:
 *         Office → Google Sheet tab → "Apps Script Web App URL", or
 *         .env → GOOGLE_SCRIPT_WEB_APP_URL
 *
 *  Supported actions (spec §56):
 *    GET  ?action=ping
 *    GET  ?action=pull&sheetName=Meals
 *    POST {action:"sync", office:{...}, month:{...}, sheets:[{name,headers,rows}]}
 *    POST {action:"pushRows",    sheetName, rows, headers?}
 *    POST {action:"replaceSheet",sheetName, headers, rows}
 *    POST {action:"upsertById",  sheetName, idColumn, row}
 *    POST {action:"deleteById",  sheetName, idColumn, id}
 *
 *  Data priority (spec §65): PostgreSQL is the primary database. This script
 *  only ever rewrites the reporting copy — a failure here can never lose data.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ───────────────────────── configuration ───────────────────────── */

var CONFIG = {
  /** Spreadsheet id (from the /d/<ID>/ part of the sheet URL). "" = the container sheet. */
  SPREADSHEET_ID: '',
  /** Optional shared secret. When set, every request must send {token:"…"} or ?token=… */
  API_TOKEN: '',
  /** Freeze the header row after writing */
  FREEZE_HEADER: true,
  /** Write a "99_সিংক_লগ" tab with one row per sync */
  WRITE_SYNC_LOG: true,
  /** Maximum rows accepted in a single request (safety valve) */
  MAX_ROWS: 60000,
};

/** Exact tab names — must match src/lib/sheet-structure.ts (spec §46) */
var TABS = {
  OFFICE_INFO: '00_অফিস_ইনফো',
  MEMBERS: '01_সদস্য_তালিকা',
  MEALS: '02_দৈনিক_মিল_খাতা',
  BAZAR: '03_বাজার_খরচ',
  DEPOSITS: '04_জমা_ও_তহবিল',
  INCOME: '05_অন্যান্য_আয়',
  SUMMARY: '06_হিসাব_সামারি',
  DENA_PAONA: '07_দেনা_পাওনা',
  SYNC_LOG: '99_সিংক_লগ',
};

var TAB_ORDER = [
  TABS.OFFICE_INFO,
  TABS.MEMBERS,
  TABS.MEALS,
  TABS.BAZAR,
  TABS.DEPOSITS,
  TABS.INCOME,
  TABS.SUMMARY,
  TABS.DENA_PAONA,
];

/** Logical name → real tab name (for ?action=pull&sheetName=Meals) */
var ALIASES = {
  office: TABS.OFFICE_INFO, officeinfo: TABS.OFFICE_INFO, '00': TABS.OFFICE_INFO,
  members: TABS.MEMBERS, member: TABS.MEMBERS, '01': TABS.MEMBERS,
  meals: TABS.MEALS, meal: TABS.MEALS, mill: TABS.MEALS, '02': TABS.MEALS,
  bazar: TABS.BAZAR, market: TABS.BAZAR, '03': TABS.BAZAR,
  deposits: TABS.DEPOSITS, deposit: TABS.DEPOSITS, fund: TABS.DEPOSITS, '04': TABS.DEPOSITS,
  income: TABS.INCOME, otherincome: TABS.INCOME, '05': TABS.INCOME,
  summary: TABS.SUMMARY, '06': TABS.SUMMARY,
  denapaona: TABS.DENA_PAONA, 'dena-poana': TABS.DENA_PAONA, '07': TABS.DENA_PAONA,
  synclog: TABS.SYNC_LOG, '99': TABS.SYNC_LOG,
};

/** Headers that must ALWAYS stay text — ids, phones and dates must not be mangled */
var TEXT_COLUMNS = /^(.*ID|.*Id|Phone|OfficeCode|Date|SyncedAt|Status|Active|MemberName|Name|Role|ItemName|Items|Buyer|BuyerName|Category|Note|Source|Type|Scope|Key|Value|MonthName|OfficeName|Branch|Address|Email|CreatedAt|UpdatedAt|PaidBy|ReceivedBy|Purpose)$/;

/** Headers that should be written as real numbers so Google Sheets can total them */
var NUMERIC_COLUMNS = /^(Year|Month|Day|Days|Meals|Amount|Total.*|.*Rate|.*Cost|.*Extra|.*Balance|DenaPoana|PermanentFund|OtherIncome|NetMealCost|Value|Rows|DurationMs|OpeningDue|JerAdjusted|RemainingJer)$/;

/* ───────────────────────── HTTP entry points ───────────────────────── */

function doGet(e) {
  return guard(e, function () {
    var action = param(e, 'action') || 'ping';
    if (action === 'ping') return doPing();
    if (action === 'pull') return doPull(param(e, 'sheetName') || 'Meals');
    if (action === 'tabs') return doListTabs();
    return fail('Unknown action: ' + action + ' (supported: ping, pull, tabs)');
  });
}

function doPost(e) {
  return guard(e, function () {
    var payload = parseBody(e);
    var action = (payload && payload.action) || param(e, 'action') || 'sync';

    if (action === 'ping') return doPing();
    if (action === 'sync') return doSync(payload);
    if (action === 'pushRows') return doPushRows(payload);
    if (action === 'replaceSheet') return doReplaceSheet(payload);
    if (action === 'upsertById') return doUpsertById(payload);
    if (action === 'deleteById') return doDeleteById(payload);
    if (action === 'pull') return doPull(payload.sheetName || 'Meals');
    return fail('Unknown action: ' + action);
  });
}

/* ───────────────────────── actions ───────────────────────── */

/** action=ping — system status check (spec §56) */
function doPing() {
  var ss = getSpreadsheet();
  var tabs = ss.getSheets().map(function (s) { return s.getName(); });
  return ok({
    message: 'Mess Meal Manager Apps Script is running',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    tabs: tabs,
    missingTabs: TAB_ORDER.filter(function (t) { return tabs.indexOf(t) === -1; }),
    time: new Date().toISOString(),
    version: 1,
  });
}

/** action=pull&sheetName=Meals — read a tab back (spec §56) */
function doPull(sheetName) {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, resolveTabName(sheetName));
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0] : [];
  var rows = values.slice(1);
  return ok({
    sheetName: sheet.getName(),
    headers: headers,
    rows: rows,
    rowCount: rows.length,
    lastUpdated: sheet.getLastUpdated ? sheet.getLastUpdated().toISOString() : null,
  });
}

function doListTabs() {
  var ss = getSpreadsheet();
  return ok({
    tabs: ss.getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), columns: s.getLastColumn() };
    }),
  });
}

/**
 * action=sync — FULL SYNC (spec §57–§59)
 *
 *   Receive payload → identify office → identify month → build sheets →
 *   write headers → write data → freeze header → return success
 *
 * Every target tab is completely rewritten (clearContents + setValues) so the
 * spreadsheet is always an exact snapshot of PostgreSQL.
 */
function doSync(payload) {
  if (!payload || !payload.sheets || !payload.sheets.length) {
    return fail('Payload has no sheets[] to write');
  }

  var ss = getSpreadsheet();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
  } catch (err) {
    return fail('Another sync is running, please retry: ' + err.message);
  }

  var started = new Date();
  var written = [];
  var totalRows = 0;

  try {
    ss.setSpreadsheetLocale('en_US');

    // 1) make sure every required tab exists, in the canonical order
    TAB_ORDER.forEach(function (name) { getOrCreateSheet(ss, name); });

    // 2) rewrite each tab from the payload
    payload.sheets.forEach(function (block) {
      var name = block.name;
      if (!name) return;
      var headers = block.headers || [];
      var rows = normalizeRows(block.rows || []);
      if (rows.length > CONFIG.MAX_ROWS) {
        throw new Error('Too many rows for tab ' + name + ' (' + rows.length + ')');
      }
      writeSheet(ss, name, headers, rows);
      written.push({ name: name, rows: rows.length });
      totalRows += rows.length;
    });

    // 3) remove tabs that are not part of the structure (keep the log tab)
    removeUnknownTabs(ss, payload.sheets.map(function (b) { return b.name; }));

    // 4) sync log
    if (CONFIG.WRITE_SYNC_LOG) {
      appendSyncLog(ss, payload, totalRows, new Date().getTime() - started.getTime(), true, 'OK');
    }

    return ok({
      message: 'Google Sheets full sync OK',
      sheetUrl: ss.getUrl(),
      sheetId: ss.getId(),
      syncedAt: new Date().toISOString(),
      office: payload.office || null,
      month: payload.month || null,
      tabs: written,
      totalRows: totalRows,
      durationMs: new Date().getTime() - started.getTime(),
    });
  } catch (err) {
    if (CONFIG.WRITE_SYNC_LOG) {
      try { appendSyncLog(ss, payload, 0, new Date().getTime() - started.getTime(), false, String(err.message || err)); } catch (ignored) {}
    }
    return fail('Sync failed: ' + (err && err.message ? err.message : err));
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/** action=replaceSheet — rewrite one tab */
function doReplaceSheet(payload) {
  var name = resolveTabName(payload.sheetName || payload.name);
  var ss = getSpreadsheet();
  var rows = normalizeRows(payload.rows || []);
  writeSheet(ss, name, payload.headers || [], rows);
  return ok({ message: 'Sheet replaced', sheetName: name, rows: rows.length, sheetUrl: ss.getUrl(), sheetId: ss.getId(), syncedAt: new Date().toISOString() });
}

/** action=pushRows — append rows to a tab (creates the header when empty) */
function doPushRows(payload) {
  var name = resolveTabName(payload.sheetName || payload.name);
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, name);
  var rows = normalizeRows(payload.rows || []);
  if (!rows.length) return fail('No rows to push');

  if (sheet.getLastRow() === 0 && payload.headers && payload.headers.length) {
    sheet.getRange(1, 1, 1, payload.headers.length).setValues([payload.headers]);
    if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
  }
  var startCol = 1;
  sheet.getRange(sheet.getLastRow() + 1, startCol, rows.length, rows[0].length).setValues(rows);
  return ok({ message: 'Rows pushed', sheetName: name, appended: rows.length, totalRows: Math.max(0, sheet.getLastRow() - 1), sheetUrl: ss.getUrl(), syncedAt: new Date().toISOString() });
}

/** action=upsertById — update the row whose idColumn matches, else append */
function doUpsertById(payload) {
  var name = resolveTabName(payload.sheetName || payload.name);
  var idColumn = payload.idColumn || 'EntryID';
  var row = normalizeRow(payload.row || {});
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, name);
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0] : Object.keys(row);

  if (!values.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
    values = [headers];
  }

  var idx = headers.indexOf(idColumn);
  if (idx === -1) return fail('idColumn "' + idColumn + '" not found in ' + name);

  var newRow = headers.map(function (h) { return row.hasOwnProperty(h) ? row[h] : ''; });
  var targetId = String(row[idColumn] || '');

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx]) === targetId) {
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([newRow]);
      return ok({ message: 'Row updated', sheetName: name, id: targetId, rowIndex: r + 1, syncedAt: new Date().toISOString() });
    }
  }

  sheet.getRange(values.length + 1, 1, 1, headers.length).setValues([newRow]);
  return ok({ message: 'Row inserted', sheetName: name, id: targetId, rowIndex: values.length + 1, syncedAt: new Date().toISOString() });
}

/** action=deleteById — delete the row whose idColumn matches */
function doDeleteById(payload) {
  var name = resolveTabName(payload.sheetName || payload.name);
  var idColumn = payload.idColumn || 'EntryID';
  var targetId = String(payload.id || '');
  if (!targetId) return fail('Missing id');

  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, name);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return ok({ message: 'Sheet empty, nothing to delete', deleted: 0 });

  var idx = values[0].indexOf(idColumn);
  if (idx === -1) return fail('idColumn "' + idColumn + '" not found in ' + name);

  var deleted = 0;
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idx]) === targetId) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }
  return ok({ message: deleted ? 'Row deleted' : 'Row not found', deleted: deleted, sheetName: name, syncedAt: new Date().toISOString() });
}

/* ───────────────────────── spreadsheet helpers ───────────────────────── */

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('No spreadsheet bound. Set CONFIG.SPREADSHEET_ID or run this from a spreadsheet container.');
}

function resolveTabName(input) {
  var key = String(input || '').trim();
  if (!key) throw new Error('sheetName is required');
  var lower = key.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  // allow the exact Bangla tab name too
  for (var i = 0; i < TAB_ORDER.length; i++) if (TAB_ORDER[i] === key) return TAB_ORDER[i];
  if (key === TABS.SYNC_LOG) return TABS.SYNC_LOG;
  return key; // custom tab names are allowed
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  // keep the canonical tab order
  var wanted = TAB_ORDER.indexOf(name);
  if (wanted > -1) {
    try { ss.setActiveSheet(sheet); ss.moveActiveSheetTo(wanted + 1); } catch (ignored) {}
  }
  return sheet;
}

function removeUnknownTabs(ss, keepNames) {
  var allowed = keepNames.concat([TABS.SYNC_LOG]);
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (allowed.indexOf(name) > -1) return;
    // never delete the last sheet, and never delete sheets that hold data
    if (ss.getSheets().length <= 1) return;
    if (sheet.getLastRow() > 1) return;
    try { ss.deleteSheet(sheet); } catch (ignored) {}
  });
}

/** Full rewrite of one tab: clearContents → headers → rows → freeze (spec §59) */
function writeSheet(ss, name, headers, rows) {
  var sheet = getOrCreateSheet(ss, name);
  var headerRow = headers && headers.length ? headers : (rows.length ? rows[0].map(function (_, i) { return 'Column' + (i + 1); }) : []);
  var width = Math.max(headerRow.length, rows.length ? rows[0].length : 0);
  if (!width) {
    sheet.clearContents();
    return sheet;
  }

  sheet.clear();
  var paddedHeader = pad(headerRow, width, '');
  sheet.getRange(1, 1, 1, width).setValues([paddedHeader]).setFontWeight('bold');

  if (rows.length) {
    var padded = rows.map(function (r) { return pad(normalizeTypes(paddedHeader, r), width, ''); });
    sheet.getRange(2, 1, padded.length, width).setValues(padded);
  }

  if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
  formatNumberColumns(sheet, paddedHeader);
  sheet.autoResizeColumns(1, width);
  return sheet;
}

function pad(arr, width, fill) {
  var out = arr.slice(0, width);
  while (out.length < width) out.push(fill);
  return out;
}

/**
 * Store numbers as numbers and TRUE/FALSE as booleans so Google Sheets can
 * total them — but ids, phones and dates are ALWAYS kept as text so
 * "01711111111" never turns into 1711111111.
 */
function normalizeTypes(headers, row) {
  return row.map(function (value, i) {
    var header = String(headers[i] || '');
    if (value === null || value === undefined) return '';
    if (TEXT_COLUMNS.test(header)) {
      if (header === 'Active' || header === 'Status') {
        if (header === 'Active') return isTruthy(value);
      }
      return String(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    var text = String(value).trim();
    if (text === '') return '';
    if (isTruthy(text)) return true;
    if (isFalsy(text)) return false;
    if (NUMERIC_COLUMNS.test(header) && isFinite(Number(text))) return Number(text);
    return text;
  });
}

/** TRUE/হ্যাঁ/yes/1 → boolean true (Sheets shows ✓/TRUE and formulas work) */
function isTruthy(value) {
  if (value === true) return true;
  var text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === '1' || text === 'হ্যাঁ' || text === 'সক্রিয়' || text === 'active';
}

function isFalsy(value) {
  if (value === false) return true;
  var text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  return text === 'false' || text === 'no' || text === '0' || text === 'না' || text === 'নিষ্ক্রিয়' || text === 'inactive';
}

/** Apply a 2-decimal number format to money / meal columns (keeps raw precision) */
function formatNumberColumns(sheet, headers) {
  for (var c = 0; c < headers.length; c++) {
    var header = String(headers[c] || '');
    if (TEXT_COLUMNS.test(header)) continue;
    if (!NUMERIC_COLUMNS.test(header)) continue;
    if (/^(Year|Month|Day|Days|Rows|DurationMs)$/.test(header)) continue;
    try {
      sheet.getRange(2, c + 1, Math.max(1, sheet.getLastRow() - 1), 1).setNumberFormat('#,##0.00');
    } catch (ignored) {}
  }
}

function normalizeRows(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function (r) { return Array.isArray(r) ? r : Object.keys(r).map(function (k) { return r[k]; }); });
}

function normalizeRow(row) {
  if (Array.isArray(row)) return row;
  return row;
}

function appendSyncLog(ss, payload, totalRows, durationMs, success, message) {
  var sheet = getOrCreateSheet(ss, TABS.SYNC_LOG);
  var headers = ['SyncedAt', 'OfficeID', 'OfficeName', 'MonthID', 'MonthName', 'Tabs', 'Rows', 'DurationMs', 'OK', 'Message'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
  }
  var office = payload.office || {};
  var month = payload.month || {};
  sheet.appendRow([
    new Date(),
    office.id || '',
    office.name || '',
    month.id || '',
    month.name || '',
    (payload.sheets || []).length,
    totalRows,
    durationMs,
    success ? 'TRUE' : 'FALSE',
    String(message || '').slice(0, 400),
  ]);
}

/* ───────────────────────── request / response plumbing ───────────────────────── */

function param(e, name) {
  try {
    if (e && e.parameter && e.parameter[name] !== undefined) return e.parameter[name];
  } catch (ignored) {}
  return '';
}

function parseBody(e) {
  var text = '';
  try { text = (e && e.postData && e.postData.contents) || ''; } catch (ignored) {}
  if (!text) return {};
  try { return JSON.parse(text); } catch (err) { throw new Error('Invalid JSON body: ' + err.message); }
}

/**
 * Wraps every request: optional shared-secret check, JSON output and a
 * top-level error handler so the app always receives parseable JSON.
 */
function guard(e, fn) {
  var started = new Date().getTime();
  try {
    if (CONFIG.API_TOKEN && !tokenMatches(e)) {
      return json({ ok: false, error: 'Invalid or missing token', message: 'Invalid or missing token' });
    }
    var result = fn();
    if (result && typeof result === 'object' && result.getContent) return result;
    return json(result);
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    return json({ ok: false, error: message, message: message, durationMs: new Date().getTime() - started });
  }
}

/** The app sends {token:"…"} in the body (or ?token=… on GET). */
function tokenMatches(e) {
  var fromQuery = param(e, 'token');
  if (fromQuery && fromQuery === CONFIG.API_TOKEN) return true;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || 'null');
    return !!body && body.token === CONFIG.API_TOKEN;
  } catch (ignored) {
    return false;
  }
}

function ok(extra) {
  var body = { ok: true, message: 'OK', error: null };
  for (var k in extra) if (extra.hasOwnProperty(k)) body[k] = extra[k];
  return json(body);
}

function fail(message) {
  var text = String(message || 'Failed');
  return json({ ok: false, error: text, message: text });
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── one-time setup helpers ───────────────────────── */

/**
 * Run once from the Apps Script editor to create a dedicated spreadsheet for
 * one office. It logs the id + url — paste the id into CONFIG.SPREADSHEET_ID
 * (or into the app's office settings as the Google Sheet URL).
 */
function setupCreateSpreadsheet() {
  var name = 'Mess Meal Manager - Gobra';
  var ss = SpreadsheetApp.create(name);
  // a brand new spreadsheet ships with one default sheet — reuse it
  var existing = ss.getSheets();
  TAB_ORDER.forEach(function (tab, i) {
    if (i === 0 && existing.length) {
      existing[0].setName(tab);
      return;
    }
    getOrCreateSheet(ss, tab);
  });
  ss.setSpreadsheetLocale('en_US');
  Logger.log('Created: %s\nID: %s\nURL: %s', name, ss.getId(), ss.getUrl());
  return { id: ss.getId(), url: ss.getUrl(), name: name };
}

/** Run once to (re)create the empty tab structure in the bound spreadsheet. */
function setupTabs() {
  var ss = getSpreadsheet();
  TAB_ORDER.forEach(function (name) { getOrCreateSheet(ss, name); });
  Logger.log('Tabs ready: %s', ss.getSheets().map(function (s) { return s.getName(); }).join(' | '));
  return ss.getUrl();
}

/**
 * Local test — paste the JSON copied from the app's
 * "Google Sheet → { } Payload দেখুন → কপি করুন" into TEST_PAYLOAD and run.
 */
function testRunSync() {
  var TEST_PAYLOAD = { action: 'sync', office: { id: 'office_test', name: 'Test Office', code: 'TEST01' }, month: { id: 'office_test-2026-09', name: 'September 2026' }, sheets: [] };
  if (!TEST_PAYLOAD.sheets.length) {
    TEST_PAYLOAD.sheets = [
      { name: TABS.OFFICE_INFO, headers: ['Key', 'Value'], rows: [['OfficeName', 'Test Office']] },
      { name: TABS.SUMMARY, headers: ['MonthID', 'TotalMeals', 'MealRate'], rows: [['office_test-2026-09', 120, 40]] },
    ];
  }
  var out = doPost({ parameter: {}, postData: { contents: JSON.stringify(TEST_PAYLOAD) } });
  Logger.log(out.getContent());
}
