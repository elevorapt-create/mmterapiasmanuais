const COOKIE = '__Host-mm_crm';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const stages = ['new', 'conversation', 'follow_up', 'scheduled', 'completed', 'lost'];
const qualifications = ['unrated', 'cold', 'warm', 'hot'];
const sources = ['unknown', 'website', 'whatsapp', 'instagram', 'google', 'referral', 'other'];
const leadFields = [
  'name', 'phone', 'email', 'service_id', 'stage', 'qualification', 'source',
  'next_action', 'follow_up_on', 'appointment_at', 'notes', 'utm_source',
  'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
];
const serviceFields = ['name', 'description', 'duration_minutes', 'price_cents', 'active'];

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      ...extraHeaders,
    },
  });
}

function sessionCookie(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;
}

async function sign(key, value) {
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}

function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function readJson(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new RequestError(403, 'Origem do pedido inválida.');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError(415, 'Utilize o formato JSON.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Pedido inválido.');
  let body = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new RequestError(413, 'O pedido excede o tamanho permitido.');
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const data = JSON.parse(body + decoder.decode());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // Return the same error for malformed JSON and unsupported payload types.
  }
  throw new RequestError(400, 'Pedido inválido.');
}

function textField(data, field, max, label, required = false) {
  const value = data[field] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new RequestError(400, 'Verifique o campo ' + label + '.');
  }
  return value.trim();
}

function choice(data, field, choices, label) {
  if (!choices.includes(data[field])) {
    throw new RequestError(400, 'Selecione uma opção válida para ' + label + '.');
  }
  return data[field];
}

function integer(value, min, max, label, optional = true) {
  if (optional && (value === null || value === undefined)) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RequestError(400, 'Verifique o campo ' + label + '.');
  }
  return value;
}

function dateField(data, field, label, withTime = false) {
  const value = textField(data, field, withTime ? 16 : 10, label);
  if (!value) return '';
  const pattern = withTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  const date = new Date(value + (withTime ? ':00Z' : 'T00:00:00Z'));
  if (!pattern.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, value.length) !== value) {
    throw new RequestError(400, 'Verifique o campo ' + label + '.');
  }
  return value;
}

async function leadValues(data, db) {
  const email = textField(data, 'email', 254, 'e-mail');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, 'Introduza um e-mail válido.');
  }
  const serviceId = integer(data.service_id, 1, Number.MAX_SAFE_INTEGER, 'serviço');
  if (serviceId !== null && !await db.prepare('SELECT id FROM services WHERE id = ?').bind(serviceId).first()) {
    throw new RequestError(400, 'Selecione um serviço existente.');
  }
  return [
    textField(data, 'name', 120, 'nome', true),
    textField(data, 'phone', 40, 'telefone'),
    email,
    serviceId,
    choice(data, 'stage', stages, 'etapa'),
    choice(data, 'qualification', qualifications, 'qualificação'),
    choice(data, 'source', sources, 'origem'),
    textField(data, 'next_action', 240, 'próxima ação'),
    dateField(data, 'follow_up_on', 'data de seguimento'),
    dateField(data, 'appointment_at', 'data do agendamento', true),
    textField(data, 'notes', 2000, 'notas'),
    ...leadFields.slice(11).map(field => textField(data, field, 200, field)),
  ];
}

function serviceValues(data) {
  if (typeof data.active !== 'boolean') throw new RequestError(400, 'Verifique o estado do serviço.');
  return [
    textField(data, 'name', 120, 'nome', true),
    textField(data, 'description', 600, 'descrição'),
    integer(data.duration_minutes, 1, 1440, 'duração'),
    integer(data.price_cents, 0, 10000000, 'preço'),
    Number(data.active),
  ];
}

async function login(request, env, key, now) {
  const data = await readJson(request);
  const password = data.password;
  if (typeof password !== 'string' || !password.length || password.length > 512) {
    throw new RequestError(400, 'Introduza a palavra-passe.');
  }
  const db = env.CRM_DB;
  const clientKey = await sign(key, 'client:' + (request.headers.get('CF-Connecting-IP') ?? 'local'));
  const expires = now + 900;
  const [, attempt] = await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').bind(now),
    db.prepare(
      'INSERT INTO login_attempts (client_key, expires_at, attempts) VALUES (?, ?, 1) ' +
      'ON CONFLICT(client_key) DO UPDATE SET attempts = min(attempts + 1, 9) RETURNING attempts',
    ).bind(clientKey, expires),
  ]);
  if (attempt.results[0].attempts > 8) {
    return json({ error: 'Demasiadas tentativas. Volte a tentar dentro de alguns minutos.' }, 429);
  }
  const [supplied, expected] = await Promise.all([
    sign(key, 'password:' + password),
    sign(key, 'password:' + env.CRM_ADMIN_PASSWORD),
  ]);
  if (!secureEqual(supplied, expected)) return json({ error: 'Palavra-passe incorreta.' }, 401);

  const token = crypto.randomUUID() + crypto.randomUUID();
  const sessionKey = await sign(key, 'session:' + token);
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE client_key = ?').bind(clientKey),
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO admin_sessions (session_key, expires_at) VALUES (?, ?)').bind(sessionKey, now + SESSION_SECONDS),
  ]);
  return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
}

async function activeSession(request, db, key, now) {
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(COOKIE + '='));
  const token = cookie?.slice(COOKIE.length + 1) ?? '';
  if (!/^[a-f0-9-]{72}$/.test(token)) return null;
  const sessionKey = await sign(key, 'session:' + token);
  return await db.prepare('SELECT session_key FROM admin_sessions WHERE session_key = ? AND expires_at > ?')
    .bind(sessionKey, now).first('session_key');
}

async function listLeads(db, query) {
  const filters = [];
  const parameters = [];
  const term = (query.get('q') ?? '').trim().slice(0, 120);
  const stage = query.get('stage');
  const qualification = query.get('qualification');
  const service = query.get('service');
  if (term) {
    filters.push('(instr(lower(leads.name), lower(?)) OR instr(leads.phone, ?) OR instr(lower(leads.email), lower(?)))');
    parameters.push(term, term, term);
  }
  if (stages.includes(stage)) {
    filters.push('stage = ?');
    parameters.push(stage);
  }
  if (qualifications.includes(qualification)) {
    filters.push('qualification = ?');
    parameters.push(qualification);
  }
  if (service && /^[1-9]\d{0,14}$/.test(service)) {
    filters.push('service_id = ?');
    parameters.push(Number(service));
  }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const page = Math.min(100000, Math.max(1, Number.parseInt(query.get('page'), 10) || 1));
  const pageSize = 60;
  const [leads, summary, values] = await db.batch([
    db.prepare(
      'SELECT id, version, name, service_name, service_price_cents, stage, qualification, ' +
      'next_action, follow_up_on, appointment_at FROM leads' +
      where + " ORDER BY NULLIF(follow_up_on, '') ASC NULLS LAST, updated_at DESC, leads.id DESC LIMIT ? OFFSET ?",
    ).bind(...parameters, pageSize, (page - 1) * pageSize),
    db.prepare('SELECT stage, count(*) AS total FROM leads' + where + ' GROUP BY stage').bind(...parameters),
    db.prepare(
      "SELECT stage, sum(service_price_cents) AS cents FROM leads WHERE stage IN ('scheduled', 'completed') GROUP BY stage",
    ),
  ]);
  return json({ leads: leads.results, totals: summary.results, values: values.results, page_size: pageSize });
}

function changedRecord(row) {
  if (!row) throw new RequestError(409, 'O registo foi alterado ou excluído. Atualize a página e tente novamente.');
  return json(row);
}

async function saveRecord(db, table, id, fields, values, data) {
  if (id === undefined) {
    const placeholders = fields.map(() => '?').join(', ');
    const row = await db.prepare('INSERT INTO ' + table + ' (id, ' + fields.join(', ') + ') VALUES (' +
      '(SELECT last_id + 1 FROM crm_record_sequences WHERE resource = ?), ' + placeholders + ') RETURNING id')
      .bind(table, ...values).first();
    return json(row, 201);
  }
  const version = integer(data.version, 1, Number.MAX_SAFE_INTEGER, 'versão', false);
  const updateTime = table === 'leads' ? ", updated_at = datetime('now')" : '';
  const clearService = table === 'leads' && data.service_id == null && data.clear_service === true
    ? ', service_name = NULL, service_price_cents = NULL' : '';
  const row = await db.prepare('UPDATE ' + table + ' SET ' + fields.map(field => field + ' = ?').join(', ') +
    ', version = version + 1' + updateTime + clearService + ' WHERE id = ? AND version = ? RETURNING id')
    .bind(...values, id, version).first();
  return changedRecord(row);
}

export async function onRequest({ request, env, params }) {
  try {
    const path = params.path ?? [];
    const url = new URL(request.url);
    const { method } = request;
    const db = env.CRM_DB;
    const [resource, identifier] = path;
    if (!db || !env.CRM_ADMIN_PASSWORD || (env.CRM_SESSION_SECRET?.length ?? 0) < 32) {
      throw new RequestError(503, 'O CRM ainda não está configurado neste ambiente.');
    }
    const material = JSON.stringify([env.CRM_SESSION_SECRET, env.CRM_ADMIN_PASSWORD]);
    const key = await crypto.subtle.importKey('raw', encoder.encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    if (path.length === 1 && resource === 'login' && method === 'POST') return await login(request, env, key, now);
    const session = await activeSession(request, db, key, now);
    if (!session) throw new RequestError(401, 'Inicie sessão para continuar.');
    if (path.length === 1 && resource === 'session' && method === 'GET') return json({ authenticated: true });
    if (path.length === 1 && resource === 'logout' && method === 'POST') {
      await readJson(request);
      await db.prepare('DELETE FROM admin_sessions WHERE session_key = ?').bind(session).run();
      return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (path.length === 1 && resource === 'leads' && method === 'GET') return await listLeads(db, url.searchParams);
    if (path.length === 1 && resource === 'services' && method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM services ORDER BY active DESC, name COLLATE NOCASE, id').all();
      return json({ services: results });
    }
    if (path.length === 1 && method === 'POST') {
      if (resource === 'leads') {
        const data = await readJson(request);
        return await saveRecord(db, 'leads', undefined, leadFields, await leadValues(data, db), data);
      }
      if (resource === 'services') {
        const data = await readJson(request);
        return await saveRecord(db, 'services', undefined, serviceFields, serviceValues(data), data);
      }
    }
    if (path.length === 3 && resource === 'leads' && path[2] === 'stage' && method === 'PATCH' &&
        /^[1-9]\d{0,14}$/.test(identifier)) {
      const data = await readJson(request);
      const stage = choice(data, 'stage', stages, 'etapa');
      const version = integer(data.version, 1, Number.MAX_SAFE_INTEGER, 'versão', false);
      const row = await db.prepare(
        "UPDATE leads SET stage = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ? RETURNING id",
      ).bind(stage, Number(identifier), version).first();
      return changedRecord(row);
    }
    if (path.length === 2 && /^[1-9]\d{0,14}$/.test(identifier)) {
      const id = Number(identifier);
      if (resource === 'leads' && method === 'GET') {
        const [lead, history] = await db.batch([
          db.prepare('SELECT * FROM leads WHERE id = ?').bind(id),
          db.prepare('SELECT stage, qualification, created_at FROM lead_history WHERE lead_id = ? ORDER BY id DESC LIMIT 100').bind(id),
        ]);
        if (!lead.results.length) throw new RequestError(404, 'Lead não encontrado.');
        return json({ lead: lead.results[0], history: history.results });
      }
      if (resource === 'leads' && method === 'PATCH') {
        const data = await readJson(request);
        return await saveRecord(db, 'leads', id, leadFields, await leadValues(data, db), data);
      }
      if (resource === 'services' && method === 'PATCH') {
        const data = await readJson(request);
        return await saveRecord(db, 'services', id, serviceFields, serviceValues(data), data);
      }
      if ((resource === 'leads' || resource === 'services') && method === 'DELETE') {
        const data = await readJson(request);
        const version = integer(data.version, 1, Number.MAX_SAFE_INTEGER, 'versão', false);
        const row = await db.prepare('DELETE FROM ' + resource + ' WHERE id = ? AND version = ? RETURNING id')
          .bind(id, version).first();
        return changedRecord(row);
      }
    }
    return json({ error: 'Operação não encontrada.' }, 404);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('CRM operation failed', error.name);
    return json({ error: 'Não foi possível concluir o pedido. Tente novamente.' }, 500);
  }
}
