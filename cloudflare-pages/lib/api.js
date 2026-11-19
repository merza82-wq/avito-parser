import { positiveId, validSyncKey, validTelegramInitData } from './auth.js';

const opaqueId = /^[a-f0-9]{32}$/;
const pageSize = 60;
const json = (data, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
} });

async function sync(request, env) {
  if (!await validSyncKey(request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1], env.MINIAPP_SYNC_KEY)) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'bad_payload' }, 400);
  if (Number(request.headers.get('Content-Length')) > 300_000) return json({ error: 'too_large' }, 413);
  let data;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 300_000) return json({ error: 'too_large' }, 413);
    data = JSON.parse(body);
  } catch { return json({ error: 'bad_payload' }, 400); }
  if (!data || String(data.botId) !== String(env.TELEGRAM_BOT_ID) || String(data.operatorId) !== String(env.TELEGRAM_OPERATOR_ID)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const { id, profile, title, observedAt, messages } = data;
  const now = Date.now();
  if (!opaqueId.test(id ?? '') || !/^(?:chrome|msedge)-[a-z0-9][a-z0-9_-]{0,31}$/i.test(profile ?? '') ||
      typeof title !== 'string' || !title.trim() || title.length > 120 || !Number.isSafeInteger(observedAt) ||
      observedAt <= 0 || observedAt > now + 300_000 || !Array.isArray(messages) || !messages.length || messages.length > 60 ||
      messages.some((item) => !item || !opaqueId.test(item.id ?? '') || typeof item.body !== 'string' ||
        !item.body.trim() || item.body.length > 4096 || !['incoming', 'outgoing', 'unknown'].includes(item.direction) ||
        !Number.isSafeInteger(item.sentAt) || item.sentAt <= 0 || item.sentAt > now + 300_000 ||
        !Number.isInteger(item.position) || item.position < 0 || item.position >= 60)) return json({ error: 'bad_payload' }, 400);

  const owner = [Number(env.TELEGRAM_BOT_ID), Number(env.TELEGRAM_OPERATOR_ID)];
  const existing = await env.DB.prepare('SELECT bot_id, operator_id FROM dialogs WHERE id = ?').bind(id).first();
  if (existing && (existing.bot_id !== owner[0] || existing.operator_id !== owner[1])) return json({ error: 'conflict' }, 409);
  const upsert = env.DB.prepare(`INSERT INTO dialogs VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, observed_at = excluded.observed_at
    WHERE excluded.observed_at >= dialogs.observed_at AND dialogs.bot_id = excluded.bot_id AND dialogs.operator_id = excluded.operator_id`)
    .bind(id, profile, title, observedAt, ...owner);
  const append = env.DB.prepare(`INSERT INTO messages
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM dialogs WHERE id = ? AND bot_id = ? AND operator_id = ?)
    ON CONFLICT(dialog_id, id) DO UPDATE SET direction = excluded.direction
    WHERE messages.direction = 'unknown' AND excluded.direction <> 'unknown'`);
  await env.DB.batch([upsert, ...messages.map((item) =>
    append.bind(id, item.id, item.body, item.direction, item.sentAt, item.position, id, ...owner))]);
  return json({ ok: true });
}

export async function handleApi(request, env, verify = validTelegramInitData) {
  const { pathname, searchParams } = new URL(request.url);
  const dialogMatch = /^\/api\/dialogs\/([a-f0-9]{32})$/.exec(pathname);
  if (!dialogMatch && pathname !== '/api/dialogs' && pathname !== '/api/sync') return json({ error: 'not_found' }, 404);
  if (!env.DB || !positiveId(env.TELEGRAM_BOT_ID) || !positiveId(env.TELEGRAM_OPERATOR_ID)) return json({ error: 'not_configured' }, 503);
  if (request.method !== (pathname === '/api/sync' ? 'POST' : 'GET')) return json({ error: 'method' }, 405);
  try {
    if (pathname === '/api/sync') return await sync(request, env);
    const initData = request.headers.get('Authorization')?.match(/^Telegram (.+)$/)?.[1];
    if (!await verify(initData, { botId: env.TELEGRAM_BOT_ID, operatorId: env.TELEGRAM_OPERATOR_ID })) {
      return json({ error: 'unauthorized' }, 401);
    }
    const owner = [Number(env.TELEGRAM_BOT_ID), Number(env.TELEGRAM_OPERATOR_ID)];
    if (pathname === '/api/dialogs') {
      const { results } = await env.DB.prepare(`SELECT d.id, d.profile, d.title, m.id AS lastId, m.body AS preview,
        m.direction, m.sent_at AS sentAt FROM dialogs d JOIN messages m ON m.dialog_id = d.id
        AND m.id = (SELECT id FROM messages WHERE dialog_id = d.id ORDER BY sent_at DESC, position DESC, id DESC LIMIT 1)
        WHERE d.bot_id = ? AND d.operator_id = ? ORDER BY m.sent_at DESC, d.id DESC`).bind(...owner).all();
      return json({ dialogs: results });
    }
    const [, id] = dialogMatch;
    const dialog = await env.DB.prepare('SELECT id, profile, title FROM dialogs WHERE id = ? AND bot_id = ? AND operator_id = ?')
      .bind(id, ...owner).first();
    if (!dialog) return json({ error: 'not_found' }, 404);
    const before = searchParams.get('before');
    if (before && !opaqueId.test(before)) return json({ error: 'bad_cursor' }, 400);
    const cursor = before ? await env.DB.prepare('SELECT sent_at, position, id FROM messages WHERE dialog_id = ? AND id = ?')
      .bind(id, before).first() : null;
    if (before && !cursor) return json({ error: 'bad_cursor' }, 400);
    const list = env.DB.prepare(`SELECT id, body, direction, sent_at AS sentAt FROM messages WHERE dialog_id = ?
      ${cursor ? 'AND (sent_at, position, id) < (?, ?, ?)' : ''}
      ORDER BY sent_at DESC, position DESC, id DESC LIMIT ?`);
    const { results } = await (cursor ? list.bind(id, cursor.sent_at, cursor.position, cursor.id, pageSize + 1) : list.bind(id, pageSize + 1)).all();
    const messages = results.slice(0, pageSize).reverse();
    return json({ dialog, messages, before: results.length > pageSize ? messages[0].id : null });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
