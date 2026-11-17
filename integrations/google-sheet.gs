/**
 * AIDV brief → Google Sheet.
 * Paste into the sheet: Extensions → Apps Script, replace everything, Save.
 * Project Settings → Script properties → add SHEET_SECRET (the same value as in Vercel).
 * Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone → copy the URL into Vercel SHEET_WEBHOOK_URL.
 * Then run setup() once from the editor: it adds the header row.
 */
const SHEET_NAME = 'Заявки';
const HEADERS = ['Дата и время', 'Имя', 'Услуга', 'Идея', 'Сроки', 'Бюджет', 'Способ связи', 'Контакт', 'Язык сайта', 'Согласие на обработку ПД', 'Время согласия'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold'); }
  return sh;
}

function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== PropertiesService.getScriptProperties().getProperty('SHEET_SECRET')) return out({ ok: false, error: 'auth' });
    const L = d.labels || {};
    // a leading ' stops Sheets from treating user text such as "=..." as a formula
    const safe = v => { v = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      sheet_().appendRow([new Date(d.ts), safe(d.name), safe(L.svc || d.svc), safe(d.idea || '—'), safe(L.when || d.when), safe(L.budget || d.budget), safe(L.via || d.via), safe(d.reach), d.lang || 'RU', 'да', new Date(d.consentAt)]);
    } finally { lock.releaseLock(); }
    return out({ ok: true });
  } catch (err) {
    console.error(err); // details stay in the Apps Script log, the caller only sees a generic error
    return out({ ok: false, error: 'server' });
  }
}

/** Adds the header row. Requests are kept, nothing is deleted automatically. */
function setup() {
  sheet_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'purgeOld').forEach(t => ScriptApp.deleteTrigger(t));
}
