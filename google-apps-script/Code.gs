/**
 * ══════════════════════════════════════════════════════════════════════════
 *  Mess Meal Manager — ONE SHEET FOR ALL OFFICES (আলাদা আলাদা Tab)
 *  এক শিটে সব অফিস — প্রতিটি অফিসের 8টি ট্যাব আলাদা
 * ══════════════════════════════════════════════════════════════════════════
 * 
 *  এই কোডটি দিয়ে একটি Google Sheet-এ সব অফিস sync হবে
 *  প্রতিটি অফিসের ট্যাব আলাদা থাকবে, যেমন:
 *    GOBRA01_00_অফিস_ইনফো, GOBRA01_01_সদস্য_তালিকা, ...
 *    BARISHAL01_00_অফিস_ইনফো, BARISHAL01_01_সদস্য_তালিকা, ...
 *    DHAKA01_00_অফিস_ইনফো, ...
 * 
 *  ব্যবহার:
 *  1. একটি নতুন ফাঁকা Google Sheet তৈরি করুন
 *     নাম: "Mess Meal Manager - All Offices"
 *  2. Extensions → Apps Script → Code.gs এ এই পুরো কোড পেস্ট করুন
 *  3. CONFIG.USE_OFFICE_PREFIX = true রাখুন (নিচে)
 *  4. Save → Run → setupTabsForAllOffices() — ডেমো ট্যাব তৈরি হবে
 *  5. Deploy → New deployment → Web app → Anyone → Deploy → /exec URL কপি
 *  6. Vercel → Environment Variables → GOOGLE_SCRIPT_WEB_APP_URL = /exec URL
 *     অথবা প্রতিটি Office Edit → Apps Script Web App URL এ একই /exec URL বসান
 *  7. App থেকে প্রতিটি অফিসে গিয়ে Full Sheet Sync চাপুন — একই শিটে
 *     আলাদা আলাদা ট্যাব তৈরি হবে
 * 
 *  PostgreSQL = মূল DB, Google Sheet = রিপোর্ট কপি
 * ══════════════════════════════════════════════════════════════════════════
 */

var CONFIG = {
  SPREADSHEET_ID: '', // ফাঁকা রাখলে container sheet auto-bind
  API_TOKEN: '',
  FREEZE_HEADER: true,
  WRITE_SYNC_LOG: true,
  MAX_ROWS: 60000,
  /** এক শিটে সব অফিস — true হলে ট্যাবের নামের আগে Office Code যোগ হবে */
  USE_OFFICE_PREFIX: true,
  /** সব অফিসের জন্য একটাই Sync Log ট্যাব */
  SINGLE_SYNC_LOG: true,
};

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

var TEXT_COLUMNS = /^(.*ID|.*Id|Phone|OfficeCode|Date|SyncedAt|Status|Active|MemberName|Name|Role|ItemName|Items|Buyer|BuyerName|Category|Note|Source|Type|Scope|Key|Value|MonthName|OfficeName|Branch|Address|Email|CreatedAt|UpdatedAt|PaidBy|ReceivedBy|Purpose)$/;
var NUMERIC_COLUMNS = /^(Year|Month|Day|Days|Meals|Amount|Total.*|.*Rate|.*Cost|.*Extra|.*Balance|DenaPoana|PermanentFund|OtherIncome|NetMealCost|Value|Rows|DurationMs|OpeningDue|JerAdjusted|RemainingJer)$/;

/* ───────────────────────── ফাঁকা শিটের জন্য মেনু ───────────────────────── */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🍚 Mess Manager')
      .addItem('1. Setup Tabs - Single Office', 'setupTabs')
      .addItem('2. Setup Tabs - All Offices (One Sheet)', 'setupTabsForAllOffices')
      .addItem('3. Ping Test', 'pingFromEditor')
      .addSeparator()
      .addItem('List All Tabs', 'listTabsFromEditor')
      .addToUi();
  } catch (e) {}
}

function pingFromEditor() {
  var result = doPing();
  var content = result.getContent();
  Logger.log(content);
  try { SpreadsheetApp.getUi().alert('Ping OK:\\n' + content.substring(0, 800)); } catch (ignored) {}
  return content;
}

function listTabsFromEditor() {
  var ss = getSpreadsheet();
  var tabs = ss.getSheets().map(function(s){ return s.getName(); }).join('\\n');
  Logger.log(tabs);
  try { SpreadsheetApp.getUi().alert('Tabs:\\n' + tabs); } catch (ignored) {}
}

/* ───────────────────────── HTTP entry points ───────────────────────── */

function doGet(e) {
  return guard(e, function () {
    var action = param(e, 'action') || 'ping';
    if (action === 'ping') return doPing();
    if (action === 'pull') return doPull(param(e, 'sheetName') || 'Meals');
    if (action === 'tabs') return doListTabs();
    return fail('Unknown action: ' + action);
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
    if (action === 'syncAllOffices') return doSyncAllOffices(payload);
    return fail('Unknown action: ' + action);
  });
}

/* ───────────────────────── actions ───────────────────────── */

function doPing() {
  var ss = getSpreadsheet();
  var tabs = ss.getSheets().map(function (s) { return s.getName(); });
  return ok({
    message: 'Mess Meal Manager Apps Script is running - ONE SHEET ALL OFFICES MODE',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    tabs: tabs,
    mode: CONFIG.USE_OFFICE_PREFIX ? 'ONE_SHEET_ALL_OFFICES' : 'ONE_SHEET_PER_OFFICE',
    time: new Date().toISOString(),
    version: 2,
  });
}

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
 * ONE SHEET FOR ALL OFFICES — FULL SYNC
 * প্রতিটি অফিসের জন্য ট্যাবের নামের আগে Office Code যোগ হবে
 * যেমন: GOBRA01_00_অফিস_ইনফো
 */
function doSync(payload) {
  if (!payload || !payload.sheets || !payload.sheets.length) {
    return fail('Payload has no sheets[] to write');
  }
  var ss = getSpreadsheet();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (err) {
    return fail('Another sync is running: ' + err.message);
  }
  var started = new Date();
  var written = [];
  var totalRows = 0;
  var officeCode = (payload.office && payload.office.code) ? String(payload.office.code).trim().toUpperCase() : '';
  var officeName = (payload.office && payload.office.name) ? String(payload.office.name) : '';

  try {
    ss.setSpreadsheetLocale('en_US');

    payload.sheets.forEach(function (block) {
      var baseName = block.name;
      if (!baseName) return;
      // এক শিটে সব অফিস — Office Code prefix যোগ করুন
      var actualName = CONFIG.USE_OFFICE_PREFIX && officeCode ? officeCode + '_' + baseName : baseName;
      var headers = block.headers || [];
      var rows = normalizeRows(block.rows || []);
      if (rows.length > CONFIG.MAX_ROWS) {
        throw new Error('Too many rows for tab ' + actualName);
      }
      writeSheet(ss, actualName, headers, rows);
      written.push({ name: actualName, baseName: baseName, rows: rows.length, office: officeCode });
      totalRows += rows.length;
    });

    // পুরোনো ট্যাব ডিলিট করবেন না — কারণ এক শিটে অনেক অফিসের ট্যাব থাকবে
    // শুধু sync log লিখুন
    if (CONFIG.WRITE_SYNC_LOG) {
      appendSyncLog(ss, payload, totalRows, new Date().getTime() - started.getTime(), true, 'OK - Office: ' + officeCode);
    }

    return ok({
      message: 'Sync OK - Office ' + officeCode + ' written to ONE SHEET',
      sheetUrl: ss.getUrl(),
      sheetId: ss.getId(),
      syncedAt: new Date().toISOString(),
      office: payload.office || null,
      month: payload.month || null,
      mode: 'ONE_SHEET_ALL_OFFICES',
      officeCode: officeCode,
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

/** একসাথে সব অফিস sync করার জন্য (ঐচ্ছিক) */
function doSyncAllOffices(payload) {
  if (!payload || !payload.offices || !payload.offices.length) {
    return fail('No offices in payload');
  }
  var ss = getSpreadsheet();
  var total = 0;
  var allWritten = [];
  payload.offices.forEach(function (officePayload) {
    var result = doSync(officePayload);
    // doSync already writes, just collect
    total++;
  });
  return ok({ message: 'All offices synced to ONE SHEET', offices: total, sheetUrl: ss.getUrl() });
}

function doReplaceSheet(payload) {
  var baseName = payload.sheetName || payload.name;
  var ss = getSpreadsheet();
  var officeCode = payload.officeCode || '';
  var actualName = CONFIG.USE_OFFICE_PREFIX && officeCode ? officeCode + '_' + resolveTabName(baseName) : resolveTabName(baseName);
  var rows = normalizeRows(payload.rows || []);
  writeSheet(ss, actualName, payload.headers || [], rows);
  return ok({ message: 'Sheet replaced', sheetName: actualName, rows: rows.length, sheetUrl: ss.getUrl() });
}

function doPushRows(payload) {
  var baseName = payload.sheetName || payload.name;
  var officeCode = payload.officeCode || '';
  var actualName = CONFIG.USE_OFFICE_PREFIX && officeCode ? officeCode + '_' + resolveTabName(baseName) : resolveTabName(baseName);
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, actualName);
  var rows = normalizeRows(payload.rows || []);
  if (!rows.length) return fail('No rows to push');
  if (sheet.getLastRow() === 0 && payload.headers && payload.headers.length) {
    sheet.getRange(1, 1, 1, payload.headers.length).setValues([payload.headers]);
    if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return ok({ message: 'Rows pushed', sheetName: actualName, appended: rows.length });
}

function doUpsertById(payload) {
  var baseName = payload.sheetName || payload.name;
  var officeCode = payload.officeCode || '';
  var name = CONFIG.USE_OFFICE_PREFIX && officeCode ? officeCode + '_' + resolveTabName(baseName) : resolveTabName(baseName);
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
  if (idx === -1) return fail('idColumn "' + idColumn + '" not found');
  var newRow = headers.map(function (h) { return row.hasOwnProperty(h) ? row[h] : ''; });
  var targetId = String(row[idColumn] || '');
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx]) === targetId) {
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([newRow]);
      return ok({ message: 'Row updated', sheetName: name, id: targetId });
    }
  }
  sheet.getRange(values.length + 1, 1, 1, headers.length).setValues([newRow]);
  return ok({ message: 'Row inserted', sheetName: name, id: targetId });
}

function doDeleteById(payload) {
  var baseName = payload.sheetName || payload.name;
  var officeCode = payload.officeCode || '';
  var name = CONFIG.USE_OFFICE_PREFIX && officeCode ? officeCode + '_' + resolveTabName(baseName) : resolveTabName(baseName);
  var idColumn = payload.idColumn || 'EntryID';
  var targetId = String(payload.id || '');
  if (!targetId) return fail('Missing id');
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, name);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return ok({ message: 'Sheet empty', deleted: 0 });
  var idx = values[0].indexOf(idColumn);
  if (idx === -1) return fail('idColumn not found');
  var deleted = 0;
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idx]) === targetId) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }
  return ok({ message: deleted ? 'Row deleted' : 'Row not found', deleted: deleted, sheetName: name });
}

/* ───────────────────────── spreadsheet helpers ───────────────────────── */

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('No spreadsheet bound. Set CONFIG.SPREADSHEET_ID or run from container.');
}

function resolveTabName(input) {
  var key = String(input || '').trim();
  if (!key) throw new Error('sheetName is required');
  var lower = key.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  for (var i = 0; i < TAB_ORDER.length; i++) if (TAB_ORDER[i] === key) return TAB_ORDER[i];
  if (key === TABS.SYNC_LOG) return TABS.SYNC_LOG;
  // যদি ইতিমধ্যে Office Code prefix থাকে (যেমন GOBRA01_00_অফিস_ইনফো), সেটা 그대로 রাখুন
  if (key.indexOf('_00_') > -1 || key.indexOf('_01_') > -1) return key;
  return key;
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  return sheet;
}

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

function normalizeTypes(headers, row) {
  return row.map(function (value, i) {
    var header = String(headers[i] || '');
    if (value === null || value === undefined) return '';
    if (TEXT_COLUMNS.test(header)) return String(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    var text = String(value).trim();
    if (text === '') return '';
    if (isTruthy(text)) return true;
    if (isFalsy(text)) return false;
    if (NUMERIC_COLUMNS.test(header) && isFinite(Number(text))) return Number(text);
    return text;
  });
}

function isTruthy(value) {
  if (value === true) return true;
  var text = String(value).trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === '1' || text === 'হ্যাঁ' || text === 'সক্রিয়' || text === 'active';
}

function isFalsy(value) {
  if (value === false) return true;
  var text = String(value).trim().toLowerCase();
  return text === 'false' || text === 'no' || text === '0' || text === 'না' || text === 'নিষ্ক্রিয়' || text === 'inactive';
}

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

function normalizeRow(row) { return row; }

function appendSyncLog(ss, payload, totalRows, durationMs, success, message) {
  var sheet = getOrCreateSheet(ss, TABS.SYNC_LOG);
  var headers = ['SyncedAt', 'OfficeID', 'OfficeCode', 'OfficeName', 'MonthID', 'MonthName', 'Tabs', 'Rows', 'DurationMs', 'OK', 'Message'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (CONFIG.FREEZE_HEADER) sheet.setFrozenRows(1);
  }
  var office = payload.office || {};
  var month = payload.month || {};
  sheet.appendRow([
    new Date(),
    office.id || '',
    office.code || '',
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

function param(e, name) {
  try { if (e && e.parameter && e.parameter[name] !== undefined) return e.parameter[name]; } catch (ignored) {}
  return '';
}

function parseBody(e) {
  var text = '';
  try { text = (e && e.postData && e.postData.contents) || ''; } catch (ignored) {}
  if (!text) return {};
  try { return JSON.parse(text); } catch (err) { throw new Error('Invalid JSON body: ' + err.message); }
}

function guard(e, fn) {
  var started = new Date().getTime();
  try {
    if (CONFIG.API_TOKEN && !tokenMatches(e)) {
      return json({ ok: false, error: 'Invalid token', message: 'Invalid token' });
    }
    var result = fn();
    if (result && typeof result === 'object' && result.getContent) return result;
    return json(result);
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    return json({ ok: false, error: message, message: message, durationMs: new Date().getTime() - started });
  }
}

function tokenMatches(e) {
  var fromQuery = param(e, 'token');
  if (fromQuery && fromQuery === CONFIG.API_TOKEN) return true;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || 'null');
    return !!body && body.token === CONFIG.API_TOKEN;
  } catch (ignored) { return false; }
}

function ok(extra) {
  var body = { ok: true, message: 'OK', error: null };
  for (var k in extra) if (extra.hasOwnProperty(k)) body[k] = extra[k];
  return json(body);
}

function fail(message) {
  return json({ ok: false, error: String(message || 'Failed'), message: String(message || 'Failed') });
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── setup helpers ───────────────────────── */

function setupCreateSpreadsheet() {
  var name = 'Mess Meal Manager - All Offices';
  var ss = SpreadsheetApp.create(name);
  var existing = ss.getSheets();
  TAB_ORDER.forEach(function (tab, i) {
    if (i === 0 && existing.length) { existing[0].setName('README'); return; }
    getOrCreateSheet(ss, tab);
  });
  ss.setSpreadsheetLocale('en_US');
  Logger.log('Created: %s\\nID: %s\\nURL: %s', name, ss.getId(), ss.getUrl());
  try { SpreadsheetApp.getUi().alert('Created:\\n' + ss.getUrl()); } catch (ignored) {}
  return { id: ss.getId(), url: ss.getUrl(), name: name };
}

function setupTabs() {
  var ss = getSpreadsheet();
  TAB_ORDER.forEach(function (name) { getOrCreateSheet(ss, name); });
  var tabs = ss.getSheets().map(function (s) { return s.getName(); }).join(' | ');
  Logger.log('Tabs ready: %s', tabs);
  try { SpreadsheetApp.getUi().alert('✅ Single Office Tabs তৈরি হয়েছে:\\n' + tabs); } catch (ignored) {}
  return ss.getUrl();
}

/** এক শিটে সব অফিস — AUTO, ম্যানুয়াল কোড লেখা লাগবে না */
function setupTabsForAllOffices() {
  var ss = getSpreadsheet();
  // AUTO MODE: কোনো Office Code ম্যানুয়ালি লিখতে হবে না
  // Sync করার সময় যে Office Code আসবে, সেই Code দিয়ে Tab Auto তৈরি হবে
  // যেমন: GOBRA01_00_অফিস_ইনফো, BARISHAL01_00_অফিস_ইনফো
  // এখানে শুধু Sync Log এবং README তৈরি করছি, বাকি Tab Sync-এ Auto হবে

  var existingCodes = {};
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    var match = name.match(/^([A-Z0-9]+)_00_/);
    if (match) existingCodes[match[1]] = true;
  });

  // Sync log তৈরি
  getOrCreateSheet(ss, TABS.SYNC_LOG);
  
  // README ট্যাব
  var readme = getOrCreateSheet(ss, 'README');
  readme.clear();
  readme.getRange(1, 1, 6, 2).setValues([
    ['Mess Meal Manager - All Offices', ''],
    ['Mode', 'ONE_SHEET_ALL_OFFICES (Auto)'],
    ['USE_OFFICE_PREFIX', 'true'],
    ['Existing Offices in Sheet', Object.keys(existingCodes).join(', ') || 'এখনো কোনো অফিস Sync হয়নি'],
    ['How it works', 'প্রতিটি অফিস Sync করলে Auto Tab তৈরি হবে: OFFICECODE_00_অফিস_ইনফো'],
    ['Next Step', 'প্রতিটি অফিসে গিয়ে Full Sheet Sync চাপুন'],
  ]);

  var tabs = ss.getSheets().map(function (s) { return s.getName(); }).join('\\n');
  Logger.log('Auto Mode Ready. Existing offices: %s\\nTabs:\\n%s', Object.keys(existingCodes).join(', '), tabs);
  try { 
    SpreadsheetApp.getUi().alert(
      '✅ AUTO MODE Ready!\\n\\n' +
      'কোনো Office Code ম্যানুয়ালি লিখতে হবে না।\\n\\n' +
      'Existing Offices: ' + (Object.keys(existingCodes).join(', ') || 'এখনো নেই') + '\\n\\n' +
      'এখন প্রতিটি অফিসে গিয়ে Full Sheet Sync চাপুন —\\n' +
      'যেমন GOBRA01 Sync করলে Auto তৈরি হবে:\\n' +
      'GOBRA01_00_অফিস_ইনফো, GOBRA01_01_সদস্য_তালিকা...\\n\\n' +
      'BARISHAL01 Sync করলে:\\n' +
      'BARISHAL01_00_অফিস_ইনফো...'
    ); 
  } catch (ignored) {}
  return ss.getUrl();
}
