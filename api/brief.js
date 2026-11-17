// Vercel serverless function: receives a brief from the site form,
// sends a Telegram notification and appends a row to a Google Sheet.
// Secrets live only in Vercel env vars (the repo is public):
//   TELEGRAM_BOT_TOKEN  token from @BotFather
//   TELEGRAM_CHAT_ID    chat that receives notifications (your own chat id)
//   SHEET_WEBHOOK_URL   Google Apps Script web app URL (see integrations/google-sheet.gs)
//   SHEET_SECRET        any long random string, the same one set in the Apps Script

const MAX = { name: 120, idea: 3000, reach: 200, label: 200 };
const ENUMS = {
  svc: ['ad', 'film', 'web', 'other'],
  when: ['fire', 'month', 'calm', 'unknown'],
  budget: ['50-150', '150-300', '300+', 'unknown'],
  via: ['tg', 'wa', 'call', 'mail'],
  lang: ['RU', 'EN', 'KZ'],
};

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+$/g, '').slice(0, n).trim();
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); } }
  return new Promise(resolve => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

// Only our own pages may post briefs. Browsers always send Origin on a cross-site POST.
const ALLOWED_ORIGINS = ['https://aidvstudio.com', 'https://www.aidvstudio.com', 'https://aidvstudios.com', 'https://www.aidvstudios.com'];
const originOk = o => !o || ALLOWED_ORIGINS.includes(o) || /^https:\/\/aidvstudio[a-z0-9-]*\.vercel\.app$/.test(o);

// Best-effort flood guard: max 5 briefs per IP per 10 minutes on a warm instance.
// Not a hard limit (serverless instances do not share memory), but it stops simple spam loops.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

async function withTimeout(p, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await p(ctl.signal); } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method' }); }
  if (!originOk(req.headers.origin)) return res.status(403).json({ ok: false, error: 'origin' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return res.status(429).json({ ok: false, error: 'rate' });
  const b = await readBody(req);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ ok: false, error: 'body' });

  // honeypot: real people never fill the hidden "company" field
  if (b.company) return res.status(200).json({ ok: true });

  // consent is mandatory (Law of the RK No. 94-V); checked here too, not only in the browser
  if (b.agree !== true) return res.status(400).json({ ok: false, error: 'consent' });

  const f = {
    name: clip(b.name, MAX.name),
    svc: b.svc, when: b.when, budget: b.budget, via: b.via,
    idea: clip(b.idea, MAX.idea),
    reach: clip(b.reach, MAX.reach),
    lang: ENUMS.lang.includes(b.lang) ? b.lang : 'RU',
    labels: {},
  };
  for (const k of ['svc', 'when', 'budget', 'via']) if (!ENUMS[k].includes(f[k])) return res.status(400).json({ ok: false, error: k });
  if (!f.name || !f.reach) return res.status(400).json({ ok: false, error: 'required' });
  for (const k of ['svc', 'when', 'budget', 'via']) f.labels[k] = clip(b.labels && b.labels[k], MAX.label) || f[k];

  const now = new Date();
  const when = now.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
  const { TELEGRAM_BOT_TOKEN: tg, TELEGRAM_CHAT_ID: chat, SHEET_WEBHOOK_URL: sheet, SHEET_SECRET: secret } = process.env;

  const text = [
    '<b>🆕 Новая заявка с сайта AIDV</b>',
    `<b>Имя:</b> ${esc(f.name)}`,
    `<b>Услуга:</b> ${esc(f.labels.svc)}`,
    `<b>Идея:</b> ${esc(f.idea || '—')}`,
    `<b>Сроки:</b> ${esc(f.labels.when)}`,
    `<b>Бюджет:</b> ${esc(f.labels.budget)}`,
    `<b>Связь:</b> ${esc(f.labels.via)}: ${esc(f.reach)}`,
    `<i>${when} · язык сайта ${f.lang} · согласие на обработку ПД получено</i>`,
  ].join('\n');

  const jobs = [];
  if (tg && chat) jobs.push(withTimeout(signal => fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).then(r => { if (!r.ok) throw new Error('telegram ' + r.status); }), 8000));
  if (sheet && secret) jobs.push(withTimeout(signal => fetch(sheet, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow', signal,
    body: JSON.stringify({ secret, ts: now.toISOString(), consentAt: now.toISOString(), ...f }),
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error('sheet ' + r.status); }), 9000));

  if (!jobs.length) return res.status(500).json({ ok: false, error: 'not_configured' });
  const out = await Promise.allSettled(jobs);
  out.forEach(o => o.status === 'rejected' && console.error(o.reason && o.reason.message));
  // the request counts as delivered if at least one channel got it
  const delivered = out.some(o => o.status === 'fulfilled');
  return res.status(delivered ? 200 : 502).json({ ok: delivered });
};
