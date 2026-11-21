let liveSnapshotCache = { at: 0, value: null, blockedUntil: 0 };
const dataResponseCache = new Map();
const dataReadCacheTtls = {
  "/meta/status": 60000,
  "/bolos": 15000,
  "/warnings": 15000,
  "/modlogs": 15000,
  "/announcements": 25000,
  "/cad/overview": 22000
};
const dataWriteInvalidations = {
  "/legacy/import": ["/bolos", "/warnings", "/modlogs", "/announcements", "/cad/overview"],
  "/bolo-create": ["/bolos"],
  "/bolo-update": ["/bolos"],
  "/warning-create": ["/warnings"],
  "/modlog-write": ["/modlogs"],
  "/announcement-upsert": ["/announcements"],
  "/announcement-delete": ["/announcements"],
  "/cad/unit-upsert": ["/cad/overview"],
  "/cad/unit-delete": ["/cad/overview"],
  "/cad/call-create": ["/cad/overview"],
  "/cad/call-update": ["/cad/overview"]
};
const getCachedDataResponse = (key) => {
  const item = dataResponseCache.get(key);
  if (!item) return undefined;
  if (item.expiresAt <= Date.now()) {
    dataResponseCache.delete(key);
    return undefined;
  }
  return item.value;
};
const setCachedDataResponse = (key, value, ttlMs) => {
  const now = Date.now();
  for (const [existingKey, item] of dataResponseCache) {
    if (item.expiresAt <= now) dataResponseCache.delete(existingKey);
  }
  while (dataResponseCache.size >= 256) {
    const oldest = dataResponseCache.keys().next().value;
    if (oldest === undefined) break;
    dataResponseCache.delete(oldest);
  }
  dataResponseCache.set(key, { value, expiresAt: now + ttlMs });
};
const invalidateCachedDataResponses = (paths) => {
  for (const key of dataResponseCache.keys()) {
    if (paths.some(path => key === path || key.startsWith(path + "?"))) dataResponseCache.delete(key);
  }
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
const parse = (value, fallback = {}) => { try { return JSON.parse(value || ""); } catch { return fallback; } };
const iso = (value) => {
  const s = String(value || new Date().toISOString());
  return s.length > 64 ? s.slice(0, 64) : s;
};
const text = (value, max = 2000) => String(value ?? "").slice(0, max);
const rowPayload = (row) => parse(row?.payload_json, {});
const requireId = (value) => {
  const id = text(value, 100).trim();
  if (!id || /[\r\n]/.test(id)) throw new Error("A valid record ID is required.");
  return id;
};



function tursoValue(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value: String(value) };
  }
  if (typeof value === "bigint") return { type: "integer", value: String(value) };
  if (value instanceof ArrayBuffer) {
    let binary = "";
    for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
    return { type: "blob", base64: btoa(binary) };
  }
  return { type: "text", value: String(value) };
}

function fromTursoValue(value) {
  if (!value || value.type === "null") return null;
  if (value.type === "integer") {
    const number = Number(value.value);
    return Number.isSafeInteger(number) ? number : value.value;
  }
  if (value.type === "float") return Number(value.value);
  if (value.type === "text") return value.value ?? "";
  if (value.type === "blob") return value.base64 || "";
  return value.value ?? null;
}

class TursoStatement {
  constructor(database, sql, args = []) {
    this.database = database;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) { return new TursoStatement(this.database, this.sql, args); }
  async all() {
    const result = await this.database.execute(this.sql, this.args);
    const columns = result.cols || [];
    const rows = (result.rows || []).map(row => Object.fromEntries(
      columns.map((column, index) => [column.name, fromTursoValue(row[index])])
    ));
    return { results: rows, success: true, meta: { changes: Number(result.affected_row_count || 0), last_row_id: result.last_insert_rowid ?? null } };
  }
  async first() {
    const result = await this.all();
    return result.results[0] || null;
  }
  async run() {
    const result = await this.database.execute(this.sql, this.args);
    return { success: true, meta: { changes: Number(result.affected_row_count || 0), last_row_id: result.last_insert_rowid ?? null } };
  }
}

class TursoDatabase {
  constructor(url, token) {
    const normalized = String(url).replace(/^libsql:\/\//i, "https://");
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("Turso URL must use libsql:// or https://.");
    this.endpoint = parsed.origin + "/v2/pipeline";
    this.token = token;
  }
  prepare(sql) { return new TursoStatement(this, sql); }
  async pipeline(requests) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "authorization": "Bearer " + this.token, "content-type": "application/json" },
      body: JSON.stringify({ baton: null, requests: [...requests, { type: "close" }] })
    });
    if (!response.ok) throw new Error("Turso database request failed (HTTP " + response.status + ").");
    const payload = await response.json();
    const error = (payload.results || []).find(item => item.type === "error" || item.response?.type === "error");
    if (error) throw new Error("Turso SQL request failed: " + String(error.error?.message || error.response?.error?.message || "Unknown database error").slice(0, 300));
    return (payload.results || []).map(item => item.response?.result || {});
  }
  async execute(sql, args = []) {
    const [result] = await this.pipeline([{
      type: "execute",
      stmt: { sql, args: args.map(tursoValue), want_rows: true }
    }]);
    return result || {};
  }
  async batch(statements) {
    const requests = [{ type: "execute", stmt: { sql: "BEGIN IMMEDIATE", want_rows: false } }];
    for (const statement of statements) {
      requests.push({ type: "execute", stmt: { sql: statement.sql, args: statement.args.map(tursoValue), want_rows: true } });
    }
    requests.push({ type: "execute", stmt: { sql: "COMMIT", want_rows: false } });
    const results = await this.pipeline(requests);
    return results.slice(1, -1).map(result => ({
      success: true,
      meta: { changes: Number(result.affected_row_count || 0), last_row_id: result.last_insert_rowid ?? null }
    }));
  }
}

function getDatabase(env) {
  if (String(env.MANCHESTER_STORAGE_BACKEND || "d1").toLowerCase() === "turso") {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error("Turso storage is selected but its URL or authentication token is missing.");
    return new TursoDatabase(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  }
  return db;
}

async function runRetention(db) {
 const now=new Date(), cutoff=days=>new Date(now.getTime()-days*86400000).toISOString();
 const results=await db.batch([
  db.prepare("DELETE FROM formal_warnings WHERE created_at < ?").bind(cutoff(180)),
  db.prepare("DELETE FROM moderation_logs WHERE occurred_at < ? AND lower(action) != 'ban'").bind(cutoff(180)),
  db.prepare("DELETE FROM announcements WHERE created_at < ?").bind(cutoff(30)),
  db.prepare("DELETE FROM ban_bolos WHERE lower(status) IN ('approved','accepted','rejected','denied','closed','resolved') AND updated_at < ?").bind(cutoff(90))
 ]);
 const deleted={warnings:Number(results[0]?.meta?.changes||0),moderationLogs:Number(results[1]?.meta?.changes||0),announcements:Number(results[2]?.meta?.changes||0),resolvedBolos:Number(results[3]?.meta?.changes||0)};
 const bytes=await db.prepare("SELECT COALESCE(SUM(length(payload_json)),0) AS bytes FROM (SELECT payload_json FROM ban_bolos UNION ALL SELECT payload_json FROM formal_warnings UNION ALL SELECT payload_json FROM moderation_logs UNION ALL SELECT payload_json FROM announcements UNION ALL SELECT payload_json FROM cad_calls UNION ALL SELECT payload_json FROM cad_units)").first();
 await db.prepare("INSERT INTO retention_runs(ran_at,warnings_deleted,moderation_logs_deleted,announcements_deleted,bolos_deleted,estimated_payload_bytes) VALUES(?,?,?,?,?,?)").bind(now.toISOString(),deleted.warnings,deleted.moderationLogs,deleted.announcements,deleted.resolvedBolos,Number(bytes?.bytes||0)).run();
 return {ranAt:now.toISOString(),deleted,estimatedPayloadBytes:Number(bytes?.bytes||0),discordMessagesTouched:false};
}

async function writeBolo(db, bolo, ignore = true) {
  const id = requireId(bolo.id);
  const sql = ignore
    ? "INSERT OR IGNORE INTO ban_bolos(id,player,submitter_id,status,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?)"
    : "INSERT INTO ban_bolos(id,player,submitter_id,status,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET player=excluded.player,submitter_id=excluded.submitter_id,status=excluded.status,created_at=excluded.created_at,updated_at=excluded.updated_at,payload_json=excluded.payload_json";
  await db.prepare(sql).bind(id, text(bolo.player, 64), text(bolo.submitterId, 100), text(bolo.status || "pending", 40), iso(bolo.createdAt), iso(bolo.updatedAt || bolo.createdAt), JSON.stringify(bolo)).run();
}
async function writeWarning(db, warning, id) {
  const recordId = requireId(warning.id || id || crypto.randomUUID());
  await db.prepare("INSERT OR IGNORE INTO formal_warnings(id,staff_id,player,created_at,payload_json) VALUES(?,?,?,?,?)")
    .bind(recordId, text(warning.staffId, 100), text(warning.player, 64), iso(warning.createdAt), JSON.stringify(warning)).run();
}
async function writeLog(db, log, id) {
  const recordId = requireId(log.id || id || crypto.randomUUID());
  await db.prepare("INSERT OR IGNORE INTO moderation_logs(id,occurred_at,action,player,staff_id,payload_json) VALUES(?,?,?,?,?,?)")
    .bind(recordId, iso(log.at || log.createdAt), text(log.action, 80), text(log.player, 64), text(log.discordId || log.staffId, 100), JSON.stringify(log)).run();
}

export default {
  async scheduled(controller, env, ctx) { ctx.waitUntil(runRetention(getDatabase(env))); },
  async fetch(request, env) {
    const db = getDatabase(env);
    const url = new URL(request.url);
    const cacheTtl = request.method === "GET" ? (dataReadCacheTtls[url.pathname] || 0) : 0;
    const cacheKey = url.pathname + url.search;
    if (cacheTtl) {
      const cached = getCachedDataResponse(cacheKey);
      if (cached !== undefined) return json(cached);
    }
    const reply = (value, status = 200) => {
      if (status >= 200 && status < 300 && cacheTtl) setCachedDataResponse(cacheKey, value, cacheTtl);
      if (request.method === "POST" && status >= 200 && status < 300) {
        invalidateCachedDataResponses(["/meta/status", ...(dataWriteInvalidations[url.pathname] || [])]);
      }
      return json(value, status);
    };
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const row = await db.prepare("SELECT 1 AS ok").first();
        const key = "__healthcheck:" + crypto.randomUUID();
        const stamp = new Date().toISOString();
        await db.prepare("INSERT INTO app_state(key,value,updated_at) VALUES(?,?,?)").bind(key, "ok", stamp).run();
        const written = await db.prepare("SELECT value FROM app_state WHERE key=?").bind(key).first();
        await db.prepare("DELETE FROM app_state WHERE key=?").bind(key).run();
        const healthy = row?.ok === 1 && written?.value === "ok";
        return reply({ service: "Manchester Roleplay Data API", status: healthy ? "healthy" : "degraded", storage: String(env.MANCHESTER_STORAGE_BACKEND || "d1").toLowerCase() === "turso" ? "Turso" : "D1", region: "EU", database_read_write_test: healthy ? "passed" : "failed" }, healthy ? 200 : 503);
      } catch (error) {
        console.error("Data API health check failed", error);
        return reply({ service: "Manchester Roleplay Data API", status: "unavailable", database_read_write_test: "failed" }, 503);
      }
    }

    // This Worker has no public workers.dev hostname or route. It is only reachable through account-local service bindings.
    // Access control is therefore enforced by Cloudflare Worker binding configuration.

    if (request.method === "GET" && url.pathname === "/meta/status") {
      try {
        const [bolos, warnings, logs, announcements, cadCalls, cadUnits, legacyMigration, storageEstimate, latestRetention] = await Promise.all([
          db.prepare("SELECT COUNT(*) AS count FROM ban_bolos").first(),
          db.prepare("SELECT COUNT(*) AS count FROM formal_warnings").first(),
          db.prepare("SELECT COUNT(*) AS count FROM moderation_logs").first(),
          db.prepare("SELECT COUNT(*) AS count FROM announcements").first(),
          db.prepare("SELECT COUNT(*) AS count FROM cad_calls").first(),
          db.prepare("SELECT COUNT(*) AS count FROM cad_units").first(),
          db.prepare("SELECT 1 AS done FROM schema_migrations WHERE version=2").first(),
          db.prepare("SELECT COALESCE(SUM(length(payload_json)),0) AS bytes FROM (SELECT payload_json FROM ban_bolos UNION ALL SELECT payload_json FROM formal_warnings UNION ALL SELECT payload_json FROM moderation_logs UNION ALL SELECT payload_json FROM announcements UNION ALL SELECT payload_json FROM cad_calls UNION ALL SELECT payload_json FROM cad_units)").first(),
          db.prepare("SELECT ran_at,warnings_deleted,moderation_logs_deleted,announcements_deleted,bolos_deleted,estimated_payload_bytes FROM retention_runs ORDER BY id DESC LIMIT 1").first()
        ]);
        return reply({ ok: true, storage: String(env.MANCHESTER_STORAGE_BACKEND || "d1").toLowerCase() === "turso" ? "Turso" : "D1", counts: { bolos: bolos.count, warnings: warnings.count, moderationLogs: logs.count, announcements: announcements.count, cadCalls: cadCalls.count, cadUnits: cadUnits.count }, storageMonitor: { estimatedRecordPayloadBytes: Number(storageEstimate?.bytes || 0), freePlanDatabaseLimitBytes: 524288000, estimatedPercentOfLimit: Number(((Number(storageEstimate?.bytes || 0) / 524288000) * 100).toFixed(4)), note: "Payload estimate only; excludes SQLite indexes and database overhead." }, retention: { policyDays: { warnings: 180, moderationLogs: 180, announcements: 30, resolvedBolosAfterResolution: 90 }, banActionLogs: "retained until a verified unban lifecycle exists", lastRun: latestRetention || null, auditLogs: "Discord-only; not deleted by this Worker" }, cad: "schema-ready-not-yet-enabled", legacyDataImported: Boolean(legacyMigration?.done) });
      } catch (error) {
        console.error("Data API status failed", error);
        return reply({ ok: false, error: "Could not read data status." }, 503);
      }
    }

    let body;
    const readBody = async (limit = 65536) => {
      if (body !== undefined) return body;
      const raw = await request.text();
      if (raw.length > limit) throw new Error("Request body is too large.");
      body = JSON.parse(raw || "{}");
      return body;
    };

    try {
      if (url.pathname === "/legacy/import" && request.method === "POST") {
        const data = await readBody(1_500_000);
        const bolos = Array.isArray(data.bolos) ? data.bolos.slice(0, 500) : [];
        const warnings = Array.isArray(data.warnings) ? data.warnings.slice(0, 1000) : [];
        const logs = Array.isArray(data.logs) ? data.logs.slice(0, 1000) : [];
        const announcements = Array.isArray(data.announcements) ? data.announcements.slice(0, 100) : [];
        let imported = { bolos: 0, warnings: 0, logs: 0, announcements: 0 };
        for (const item of bolos) { await writeBolo(db, item, true); imported.bolos++; }
        for (let i = 0; i < warnings.length; i++) {
          const item = warnings[i] || {};
          const id = item.id || "legacy-warning-" + i + "-" + text(item.createdAt, 40) + "-" + text(item.staffId, 32);
          await writeWarning(db, item, id); imported.warnings++;
        }
        for (let i = 0; i < logs.length; i++) {
          const item = logs[i] || {};
          const id = item.id || "legacy-log-" + i + "-" + text(item.at || item.createdAt, 40);
          await writeLog(db, item, id); imported.logs++;
        }
        for (let i = 0; i < announcements.length; i++) {
          const item = announcements[i] || {};
          const id = text(item.id || item.messageId || item.discordMessageId || ("legacy-announcement-" + i + "-" + text(item.createdAt, 40)), 100);
          await db.prepare("INSERT OR IGNORE INTO announcements(id,created_at,edited_at,payload_json) VALUES(?,?,?,?)")
            .bind(requireId(id), iso(item.createdAt), text(item.editedAt, 64), JSON.stringify(item)).run();
          imported.announcements++;
        }
        if (data.lastModCommand) {
          await db.prepare("INSERT INTO app_state(key,value,updated_at) VALUES('last_mod_command',?,?) ON CONFLICT(key) DO UPDATE SET value=CASE WHEN CAST(app_state.value AS INTEGER)>CAST(excluded.value AS INTEGER) THEN app_state.value ELSE excluded.value END,updated_at=excluded.updated_at")
            .bind(String(data.lastModCommand), new Date().toISOString()).run();
        }
        await db.prepare("INSERT OR IGNORE INTO schema_migrations(version,name,applied_at) VALUES(2,'legacy_durable_object_import',?)")
          .bind(new Date().toISOString()).run();
        return reply({ ok: true, imported, note: "Idempotent import: existing record IDs were not overwritten." });
      }

      if (url.pathname === "/bolos" && request.method === "GET") {
        const all = url.searchParams.get("all") === "1";
        const user = text(url.searchParams.get("user"), 100);
        const query = all
          ? db.prepare("SELECT payload_json FROM ban_bolos ORDER BY created_at DESC LIMIT 200")
          : db.prepare("SELECT payload_json FROM ban_bolos WHERE submitter_id=? ORDER BY created_at DESC LIMIT 200").bind(user);
        const result = await query.all();
        return reply({ bolos: (result.results || []).map(rowPayload) });
      }
      if (url.pathname === "/bolo-create" && request.method === "POST") {
        const item = await readBody(16384);
        if (!item.player || !item.reason || !item.id) return reply({ ok: false, error: "Player, reason and ID are required." }, 400);
        await writeBolo(db, item, true);
        return reply({ ok: true });
      }
      if (url.pathname === "/bolo-update" && request.method === "POST") {
        const item = await readBody(16384);
        const id = requireId(item.id);
        const row = await db.prepare("SELECT payload_json FROM ban_bolos WHERE id=?").bind(id).first();
        if (!row) return reply({ ok: false, error: "Ban BOLO not found." }, 404);
        const bolo = rowPayload(row);
        bolo.status = text(item.status, 40);
        bolo.adminNote = text(item.adminNote, 1500);
        bolo.punishment = text(item.punishment, 200);
        bolo.updatedAt = iso(item.at);
        bolo.history = Array.isArray(bolo.history) ? bolo.history : [];
        bolo.history.push({ at: bolo.updatedAt, by: text(item.by, 100), byId: text(item.byId, 100), status: bolo.status, note: bolo.adminNote, punishment: bolo.punishment });
        await writeBolo(db, bolo, false);
        return reply({ ok: true, bolo });
      }
      if (url.pathname === "/bolo-message" && request.method === "POST") {
        const item = await readBody(8192);
        const id = requireId(item.id);
        const row = await db.prepare("SELECT payload_json FROM ban_bolos WHERE id=?").bind(id).first();
        if (!row) return reply({ ok: false, error: "Ban BOLO not found." }, 404);
        const bolo = rowPayload(row);
        bolo.discordMessageId = text(item.messageId, 100);
        bolo.discordChannelId = text(item.channelId, 100);
        await writeBolo(db, bolo, false);
        return reply({ ok: true });
      }
      if (url.pathname === "/warnings" && request.method === "GET") {
        const all = url.searchParams.get("all") === "1";
        const user = text(url.searchParams.get("user"), 100);
        const query = all
          ? db.prepare("SELECT payload_json FROM formal_warnings ORDER BY created_at DESC LIMIT 200")
          : db.prepare("SELECT payload_json FROM formal_warnings WHERE staff_id=? ORDER BY created_at DESC LIMIT 200").bind(user);
        const result = await query.all();
        return reply({ warnings: (result.results || []).map(rowPayload) });
      }
      if (url.pathname === "/warning-create" && request.method === "POST") {
        const item = await readBody(16384);
        if (!item.player || !item.reason) return reply({ ok: false, error: "Player and reason are required." }, 400);
        await writeWarning(db, item);
        return reply({ ok: true });
      }
      if (url.pathname === "/modlog-write" && request.method === "POST") {
        const item = await readBody(16384);
        await writeLog(db, item);
        return reply({ ok: true });
      }
      if (url.pathname === "/modlogs" && request.method === "GET") {
        const result = await db.prepare("SELECT payload_json FROM moderation_logs ORDER BY occurred_at DESC LIMIT 100").all();
        return reply({ logs: (result.results || []).map(rowPayload) });
      }
      if (url.pathname === "/modgate" && request.method === "POST") {
        const now = Date.now();
        const result = await db.prepare(
          "INSERT INTO app_state(key,value,updated_at) VALUES('last_mod_command',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE CAST(app_state.value AS INTEGER)<=CAST(excluded.value AS INTEGER)-5000 RETURNING value"
        ).bind(String(now), new Date(now).toISOString()).first();
        if (!result) {
          const previous = await db.prepare("SELECT value FROM app_state WHERE key='last_mod_command'").first();
          const wait = Math.max(1, 5000 - (now - Number(previous?.value || 0)));
          return reply({ allowed: false, message: "ER:LC accepts one command every five seconds. Wait " + Math.ceil(wait / 1000) + " seconds." }, 429);
        }
        return reply({ allowed: true });
      }
      if (url.pathname === "/announcements" && request.method === "GET") {
        const result = await db.prepare("SELECT payload_json FROM announcements ORDER BY created_at DESC LIMIT 50").all();
        return reply({ announcements: (result.results || []).map(rowPayload) });
      }
      if (url.pathname === "/announcement-upsert" && request.method === "POST") {
        const item = await readBody(16384);
        const id = requireId(item.id || item.messageId);
        await db.prepare("INSERT INTO announcements(id,created_at,edited_at,payload_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET edited_at=excluded.edited_at,payload_json=excluded.payload_json")
          .bind(id, iso(item.createdAt), text(item.editedAt, 64), JSON.stringify(item)).run();
        return reply({ ok: true });
      }

      if (url.pathname === "/announcement-delete" && request.method === "POST") {
        const item = await readBody(8192);
        const id = requireId(item.id || item.messageId);
        await db.prepare("DELETE FROM announcements WHERE id=?").bind(id).run();
        return reply({ ok: true });
      }

      if (url.pathname === "/cad/live" && request.method === "GET") {
        if (!env.ERLC_SERVER_KEY) return reply({ ok: false, connected: false, error: "ER:LC server key is not configured." }, 503);
        if (liveSnapshotCache.blockedUntil > Date.now()) { const retryAfter = Math.max(1, Math.ceil((liveSnapshotCache.blockedUntil - Date.now()) / 1000)); if (liveSnapshotCache.value) return reply({ ...liveSnapshotCache.value, stale: true, rateLimited: true, retryAfter }); return new Response(JSON.stringify({ ok: false, connected: false, error: "ER:LC rate limit active. Waiting before retrying.", retryAfter }), { status: 429, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(retryAfter), "x-content-type-options": "nosniff" } }); }
        if (liveSnapshotCache.value && Date.now() - liveSnapshotCache.at < 10000) return reply(liveSnapshotCache.value);
        try {
          const upstream = await fetch("https://api.erlc.gg/v2/server?Players=true&Vehicles=true&EmergencyCalls=true", { headers: { "Server-Key": env.ERLC_SERVER_KEY, "Accept": "application/json" }, signal: AbortSignal.timeout(9000) });
          const raw = await upstream.text(); let payload; try { payload = JSON.parse(raw); } catch { payload = null; }
          if (upstream.status === 429) { const retryAfter = Math.max(1, Math.ceil(Number(upstream.headers.get("retry-after")) || Number(payload?.retry_after) || 60)); liveSnapshotCache.blockedUntil = Date.now() + retryAfter * 1000; if (liveSnapshotCache.value) return reply({ ...liveSnapshotCache.value, stale: true, rateLimited: true, retryAfter }); return new Response(JSON.stringify({ ok: false, connected: false, error: "ER:LC rate limit reached. Waiting before retrying.", retryAfter }), { status: 429, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(retryAfter), "x-content-type-options": "nosniff" } }); }
          if (!upstream.ok || !payload) { console.error("ER:LC live API returned HTTP", upstream.status); return reply({ ok: false, connected: false, error: upstream.status === 401 || upstream.status === 403 ? "ER:LC rejected the server key. Check the key in the data Worker." : "ER:LC live data is temporarily unavailable." }, 502); }
          const snapshot = { ok: true, connected: true, fetchedAt: new Date().toISOString(), server: payload.Server || payload.server || payload, players: payload.Players || payload.players || [], vehicles: payload.Vehicles || payload.vehicles || [], emergencyCalls: payload.EmergencyCalls || payload.emergencyCalls || payload.Emergency_Calls || [] };
          liveSnapshotCache = { at: Date.now(), value: snapshot, blockedUntil: 0 }; return reply(snapshot);
        } catch (error) { console.error("ER:LC live data fetch failed", String(error?.message || error)); return reply({ ok: false, connected: false, error: "Could not reach ER:LC live API. Retry shortly." }, 502); }
      }

      if (url.pathname === "/cad/overview" && request.method === "GET") {
        const [unitRows, callRows] = await Promise.all([
          db.prepare("SELECT payload_json FROM cad_units ORDER BY callsign LIMIT 200").all(),
          db.prepare("SELECT payload_json FROM cad_calls ORDER BY created_at DESC LIMIT 100").all()
        ]);
        return reply({
          units: (unitRows.results || []).map(rowPayload),
          calls: (callRows.results || []).map(rowPayload)
        });
      }

      if (url.pathname === "/cad/unit-upsert" && request.method === "POST") {
        const item = await readBody(16384);
        const id = requireId(item.id || crypto.randomUUID());
        const callsign = text(item.callsign, 24).trim().toUpperCase();
        const department = text(item.department, 8).trim().toUpperCase();
        const statuses = ["available", "enroute", "onscene", "busy", "offduty"];
        if (!callsign || !/^[A-Z0-9-]{2,24}$/.test(callsign)) return reply({ ok: false, error: "Enter a valid callsign (2–24 letters, numbers or hyphens)." }, 400);
        if (!["PD", "FD", "EMS", "DOT"].includes(department)) return reply({ ok: false, error: "Choose PD, FD, EMS or DOT." }, 400);
        const status = statuses.includes(item.status) ? item.status : "available";
        const coord = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
        const existingRow = await db.prepare("SELECT payload_json FROM cad_units WHERE id=?").bind(id).first();
        const existingUnit = existingRow ? rowPayload(existingRow) : null;
        const createdById = existingUnit?.createdById || text(item.actorId, 100);
        const now = new Date().toISOString();
        const unit = {
          id, callsign, department, status, createdById,
          displayName: text(item.displayName, 64).trim(),
          location: text(item.location, 120).trim(),
          x: coord(item.x), y: coord(item.y),
          currentCallId: text(item.currentCallId, 100).trim() || null,
          createdBy: text(item.createdBy, 100),
          memberIds: Array.isArray(item.memberIds) ? item.memberIds.map(x => text(x, 100)).filter(Boolean).slice(0, 8) : [],
          updatedAt: now
        };
        await db.prepare("INSERT INTO cad_units(id,callsign,department,status,current_call_id,updated_at,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET callsign=excluded.callsign,department=excluded.department,status=excluded.status,current_call_id=excluded.current_call_id,updated_at=excluded.updated_at,payload_json=excluded.payload_json")
          .bind(id, callsign, department, status, unit.currentCallId, now, JSON.stringify(unit)).run();
        if (Array.isArray(item.memberIds)) {
          await db.prepare("DELETE FROM cad_unit_members WHERE unit_id=?").bind(id).run();
          for (const memberId of unit.memberIds) {
            await db.prepare("INSERT OR IGNORE INTO cad_unit_members(id,unit_id,discord_user_id,role,joined_at) VALUES(?,?,?,?,?)")
              .bind(crypto.randomUUID(), id, memberId, "member", now).run();
          }
        }
        return reply({ ok: true, unit });
      }

      if (url.pathname === "/cad/unit-delete" && request.method === "POST") {
        const item = await readBody(8192);
        const id = requireId(item.id);
        const actorId = text(item.actorId, 100);
        if (!actorId) return reply({ ok: false, error: "Your Discord identity could not be verified." }, 401);
        const row = await db.prepare("SELECT payload_json FROM cad_units WHERE id=?").bind(id).first();
        if (!row) return reply({ ok: false, error: "Unit not found." }, 404);
        const unit = rowPayload(row);
        if (!unit.createdById || unit.createdById !== actorId) return reply({ ok: false, error: "Only the person who created this unit can delete it." }, 403);
        await db.prepare("DELETE FROM cad_unit_members WHERE unit_id=?").bind(id).run();
        await db.prepare("DELETE FROM cad_units WHERE id=?").bind(id).run();
        return reply({ ok: true, deleted: id });
      }
if (url.pathname === "/cad/call-create" && request.method === "POST") {
        const item = await readBody(16384);
        const id = requireId(item.id || crypto.randomUUID());
        const callTypes = ["Police", "Fire", "Medical", "Traffic", "Public Order", "Other"];
        const priorities = ["P1", "P2", "P3", "P4"];
        const callType = callTypes.includes(item.callType) ? item.callType : "Other";
        const priority = priorities.includes(item.priority) ? item.priority : "P3";
        const location = text(item.location, 160).trim();
        if (!location) return reply({ ok: false, error: "A call location is required." }, 400);
        const now = new Date().toISOString();
        const callNumber = "MR-" + String(Date.now()).slice(-7);
        const call = {
          id, callNumber, callType, priority, status: "open",
          location, description: text(item.description, 1200).trim(),
          x: Number.isFinite(Number(item.x)) ? Math.max(0, Math.min(100, Number(item.x))) : null,
          y: Number.isFinite(Number(item.y)) ? Math.max(0, Math.min(100, Number(item.y))) : null,
          createdBy: text(item.createdBy, 100), createdAt: now, updatedAt: now,
          assignedUnits: []
        };
        await db.prepare("INSERT INTO cad_calls(id,call_number,call_type,priority,status,location,created_by,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .bind(id, callNumber, callType, priority, "open", location, call.createdBy, now, now, JSON.stringify(call)).run();
        await db.prepare("INSERT INTO cad_call_events(id,call_id,event_type,actor_id,created_at,payload_json) VALUES(?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, "created", call.createdBy, now, JSON.stringify({ description: call.description, priority })).run();
        return reply({ ok: true, call });
      }

      if (url.pathname === "/cad/call-update" && request.method === "POST") {
        const item = await readBody(16384);
        const id = requireId(item.id);
        const row = await db.prepare("SELECT payload_json FROM cad_calls WHERE id=?").bind(id).first();
        if (!row) return reply({ ok: false, error: "CAD call not found." }, 404);
        const call = rowPayload(row);
        const statuses = ["open", "dispatched", "onscene", "closed"];
        if (item.status && !statuses.includes(item.status)) return reply({ ok: false, error: "Invalid call status." }, 400);
        if (item.status) call.status = item.status;
        if (item.description !== undefined) call.description = text(item.description, 1200).trim();
        if (item.assignedUnits !== undefined) call.assignedUnits = Array.isArray(item.assignedUnits) ? item.assignedUnits.map(x => text(x, 100)).filter(Boolean).slice(0, 20) : [];
        call.updatedAt = new Date().toISOString();
        await db.prepare("UPDATE cad_calls SET status=?,updated_at=?,payload_json=? WHERE id=?")
          .bind(call.status, call.updatedAt, JSON.stringify(call), id).run();
        await db.prepare("INSERT INTO cad_call_events(id,call_id,event_type,actor_id,created_at,payload_json) VALUES(?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, text(item.eventType || "updated", 40), text(item.actorId, 100), call.updatedAt, JSON.stringify({ status: call.status, assignedUnits: call.assignedUnits })).run();
        return reply({ ok: true, call });
      }

      return reply({ ok: false, error: "Not found." }, 404);
    } catch (error) {
      console.error("Manchester data API request failed", { path: url.pathname, message: String(error?.message || error) });
      const message = String(error?.message || error);
      if (/exceeded D1's free tier daily row read limit/i.test(message)) {
        return reply({ ok: false, error: "Cloudflare's free D1 daily read limit has been reached. Your saved records are safe. The data service will resume after midnight UTC." }, 503);
      }
      return reply({ ok: false, error: message.includes("Request body") || message.includes("ID is required") ? message : "The data service could not complete the request." }, 500);
    }
  }
};