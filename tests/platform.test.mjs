import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { TursoDatabase, getDatabase } from "../data/index.js";

const bot = await readFile(new URL("../bot/index.js", import.meta.url), "utf8");
const map = await readFile(new URL("../map-data/index.js", import.meta.url), "utf8");
const website = await readFile(new URL("../website/index.js", import.meta.url), "utf8");
const data = await readFile(new URL("../data/index.js", import.meta.url), "utf8");

function loadAutomod(source) {
  const start = source.indexOf("const AUTOMOD_PROFANITY =");
  const end = source.indexOf("async function discordChannelMessage", start);
  assert.ok(start >= 0 && end > start, "automod source block must exist");
  return vm.runInNewContext(source.slice(start, end) + "; automodViolation", { URL });
}

function loadMapTransforms(source) {
  const start = source.indexOf("function mapPxToLegacy");
  const end = source.indexOf("function transformLiveItems", start);
  assert.ok(start >= 0 && end > start, "map transform source block must exist");
  return vm.runInNewContext(source.slice(start, end) + "; ({ mapPxToLegacy, mapToLegacyFormula })");
}

function loadCommandResponse(source) {
  const start = source.indexOf("function commandResponse(name)");
  const end = source.indexOf("\nexport default", start);
  assert.ok(start >= 0 && end > start, "command response source block must exist");
  return vm.runInNewContext(source.slice(start, end) + "; commandResponse", {
    INVITE: "https://discord.gg/test",
    SITE_URL: "https://example.test"
  });
}

function loadSlashCommands(source) {
  const start = source.indexOf("const COMMANDS =");
  const end = source.indexOf("\n\nfunction json", start);
  assert.ok(start >= 0 && end > start, "slash command definitions must exist");
  return vm.runInNewContext(source.slice(start, end) + "; COMMANDS");
}

const automodViolation = loadAutomod(bot);
const { mapPxToLegacy, mapToLegacyFormula } = loadMapTransforms(map);
const commandResponse = loadCommandResponse(bot);
const slashCommands = loadSlashCommands(bot);

test("automod leaves ordinary conversation alone", () => {
  assert.equal(automodViolation("Welcome to Manchester Roleplay"), "");
});

test("automod catches prohibited words and separator obfuscation", () => {
  assert.equal(automodViolation("that is fuck"), "profanity");
  assert.equal(automodViolation("f.u.c.k"), "profanity");
});

test("automod does not match a harmless word containing a substring", () => {
  assert.equal(automodViolation("classic roleplay session"), "");
});

test("automod blocks ordinary external links but allows GIF providers", () => {
  assert.equal(automodViolation("visit https://example.com"), "unapproved_link");
  assert.equal(automodViolation("https://tenor.com/view/cat.gif"), "");
  assert.equal(automodViolation("https://example.com", true), "");
});

test("map pixel origin maps to the legacy coordinate origin", () => {
  assert.deepEqual({ ...mapPxToLegacy(503.6, 507.6) }, { LocationX: 0, LocationZ: 0 });
});


test("multi-point calibration rejects outliers and fits both map axes", () => {
  const points = [
    { id: "a", world_x: -3000, world_z: -2500, map_x: -67605, map_y: -56270, sample_count: 4 },
    { id: "b", world_x: -1800, world_z: 1000, map_x: -40710, map_y: 22245, sample_count: 3 },
    { id: "c", world_x: -500, world_z: 3200, map_x: -11600, map_y: 71760, sample_count: 2 },
    { id: "d", world_x: 900, world_z: -1200, map_x: 19790, map_y: -27220, sample_count: 2 },
    { id: "e", world_x: 2100, world_z: 2600, map_x: 46620, map_y: 58270, sample_count: 3 },
    { id: "f", world_x: 3400, world_z: 800, map_x: 75730, map_y: 17740, sample_count: 2 },
    { id: "g", world_x: 4500, world_z: -1800, map_x: 100395, map_y: -40740, sample_count: 1 },
    { id: "h", world_x: 1200, world_z: 4200, map_x: 26530, map_y: 94240, sample_count: 1 },
    { id: "bad-x", world_x: 2800, world_z: 1500, map_x: 99000, map_y: 33400, sample_count: 1 },
    { id: "bad-z", world_x: -2400, world_z: 2300, map_x: -54200, map_y: 99000, sample_count: 1 }
  ];
  const fit = fitMapCalibration(points);
  assert.equal(fit.mode, "multi-point-affine");
  assert.ok(Math.abs(fit.scale_x - 22.4) < 0.02);
  assert.ok(Math.abs(fit.scale_z - 22.5) < 0.02);
  assert.ok(Math.abs(fit.offset_x + 400) < 100);
  assert.ok(Math.abs(fit.offset_z + 250) < 100);
  assert.ok(fit.anchor_count >= 7);
  assert.ok(fit.p90_error_px < 2);
});

test("live map transform uses the fitted X and Z models independently", () => {
  const calibration = {
    mode: "multi-point-affine",
    scale_x: 22.4,
    offset_x: -400,
    scale_z: 22.5,
    offset_z: -250
  };
  const result = mapToLegacyFormula(1250, -750, calibration);
  assert.deepEqual({ ...result }, {
    ...mapPxToLegacy(22.4 * 1250 - 400, 22.5 * -750 - 250)
  });
});

test("map transform uses the published fallback only when no multi-point fit exists", () => {
  const result = mapToLegacyFormula(0, 0, { mode: "published-fallback" });
  assert.ok(Math.abs(result.LocationX - ((508.533 - 503.6) / 22)) < 1e-10);
  assert.ok(Math.abs(result.LocationZ - ((512.867 - 507.6) / 22)) < 1e-10);
});

test("Gateway watchdog skips expensive scans while healthy", () => {
  assert.match(bot, /current\.status === "online" && !outageStarted/);
  assert.match(bot, /Gateway is healthy; no recovery scan is needed/);
});

test("Gateway event failures schedule reconciliation instead of leaving a stuck error state", () => {
  assert.match(bot, /Gateway event processing failed; reconciliation scheduled/);
  assert.match(bot, /this\.ctx\.storage\.setAlarm\(Date\.now\(\) \+ 10000\)/);
  assert.match(bot, /Discord Gateway WebSocket error; reconnect scheduled/);
});

test("recovery scans are deliberately bounded into small resumable batches", () => {
  assert.equal((bot.match(/new URLSearchParams\(\{ limit: "10" \}\)/g) || []).length, 2);
  assert.equal((bot.match(/for \(let page = 0; page < 1; page\+\+\)/g) || []).length, 2);
  assert.match(bot, /recovery scan is continuing; another pass is scheduled/i);
});

test("website forwards staff, CAD, and announcement APIs to the correct services", () => {
  assert.ok(website.includes("env.BOT.fetch"), "staff and moderation routes must reach the bot service");
  assert.ok(website.includes("env.DATA.fetch"), "CAD and data routes must reach the data service");
  assert.ok(website.includes("/api/bolos"));
  assert.ok(website.includes("/api/warnings"));
  assert.ok(website.includes("/api/announcements"));
});

test("data API exposes the persistence routes used by the website and bot", () => {
  for (const route of ["/health", "/meta/status", "/modlog-write", "/bolos", "/warning-create", "/announcement-upsert", "/cad/live", "/cad/overview"]) {
    assert.ok(data.includes(route), "missing data API route: " + route);
  }
  assert.ok(data.includes("env.MANCHESTER_DB"), "data API must use its configured D1 binding");
});

test("map-data uses the dedicated map database and preserves live CAD upstream data", () => {
  assert.ok(map.includes("env.ORIGIN_DATA.fetch"), "map service must proxy the shared data API");
  assert.ok(map.includes("env.MAP_LOCATIONS_DB"), "map service must use its dedicated location database");
  assert.ok(map.includes("transformLiveItems"), "map service must transform live world coordinates");
  assert.ok(map.includes("loadMapCalibration"), "map service must load map calibration");
  assert.ok(map.includes("fitMapCalibration"), "map service must use a robust multi-point map fit");
  assert.ok(map.includes("p.kind='building_number'"), "calibration must use static building-number reference points");
  assert.ok(!map.includes("street_name IN ('CurbLeft','CurbRight')"), "calibration must not rely on the single PD anchor");
  assert.ok(map.includes("buildLocationIndex(env.MAP_LOCATIONS_DB, calibration)"), "searchable observed locations must use the same calibration as live markers");
  assert.ok(map.includes("snapshot.mapLocations"), "map service must attach searchable map reference data");
});


test("all production entrypoints use Manchester Roleplay branding", () => {
  for (const [name, source] of [["bot", bot], ["website", website], ["data", data], ["map-data", map]]) {
    assert.doesNotMatch(source, /Texas State Roleplay|Texas State Police|Texas Fire &(?:amp;)? Rescue|Texas EMS|\bTexas\b/i, name + " contains outdated Texas branding");
  }
  for (const department of ["Greater Manchester Police", "Greater Manchester Fire & Rescue", "North West Ambulance Service"]) {
    assert.ok(bot.includes(department), "bot is missing department: " + department);
    assert.ok(website.includes(department.replace("&", "&amp;")) || website.includes(department), "website is missing department: " + department);
  }
});

test("bot's HTTP interaction endpoint handles Discord PING and slash commands", () => {
  assert.match(bot, /if \(interaction\.type === 1\)[\s\S]*?return json\(\{ type: 1 \}\)/);
  assert.match(bot, /interaction\.type === 2[\s\S]*?commandResponse\(name\)/);
  assert.match(bot, /ping: "Pong! Manchester Roleplay bot is online/);
});


test("the bot returns a valid immediate /ping response and Manchester descriptions", () => {
  const response = commandResponse("ping");
  assert.equal(response.type, 4);
  assert.match(response.data.content, /Pong! Manchester Roleplay bot is online/);
  assert.match(slashCommands.find(command => command.name === "ping").description, /Manchester Roleplay/);
  assert.match(bot, /moderation_commands_version.*"manchester-roleplay-commands-v2"/);
});


test("website caches live CAD snapshots and serves bounded stale data during upstream failures", () => {
  assert.match(website, /CAD_LIVE_CACHE_TTL_MS = 60000/);
  assert.match(website, /CAD_LIVE_STALE_MAX_MS = 600000/);
  assert.match(website, /cadLiveResponseCache/);
  assert.match(website, /stale:true,retryAfter/);
  assert.match(website, /cacheAgeSeconds/);
});


test("Turso adapter maps prepared statements and SQLite values over Hrana", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body), authorization: init.headers.authorization });
    return new Response(JSON.stringify({
      results: [
        { type: "ok", response: { type: "execute", result: {
          cols: [{ name: "ok" }, { name: "label" }],
          rows: [[{ type: "integer", value: "1" }, { type: "text", value: "Manchester" }]],
          affected_row_count: 0
        } } },
        { type: "ok", response: { type: "close" } }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const db = new TursoDatabase("libsql://example-org.turso.io", "test-token");
    const row = await db.prepare("SELECT ? AS ok, ? AS label").bind(1, "Manchester").first();
    assert.deepEqual(row, { ok: 1, label: "Manchester" });
    assert.equal(requests[0].url, "https://example-org.turso.io/v2/pipeline");
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.deepEqual(requests[0].body.requests[0].stmt.args, [
      { type: "integer", value: "1" },
      { type: "text", value: "Manchester" }
    ]);
    assert.equal(requests[0].body.requests.at(-1).type, "close");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Turso adapter executes D1-style batches as one transaction", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ results: [
      { type: "ok", response: { type: "execute", result: {} } },
      { type: "ok", response: { type: "execute", result: { affected_row_count: 2 } } },
      { type: "ok", response: { type: "execute", result: { affected_row_count: 3 } } },
      { type: "ok", response: { type: "execute", result: {} } },
      { type: "ok", response: { type: "close" } }
    ] }), { status: 200 });
  };
  try {
    const db = new TursoDatabase("https://example-org.turso.io", "test-token");
    const results = await db.batch([
      db.prepare("DELETE FROM a WHERE id=?").bind(1),
      db.prepare("DELETE FROM b WHERE id=?").bind(2)
    ]);
    assert.deepEqual(results.map(x => x.meta.changes), [2, 3]);
    assert.equal(captured.requests[0].stmt.sql, "BEGIN IMMEDIATE");
    assert.equal(captured.requests[1].stmt.sql, "DELETE FROM a WHERE id=?");
    assert.equal(captured.requests[3].stmt.sql, "COMMIT");
    assert.equal(captured.requests.at(-1).type, "close");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Manchester data API keeps D1 as the safe default until an explicit Turso cutover", () => {
  const d1 = { marker: "existing D1 binding" };
  assert.equal(getDatabase({ MANCHESTER_DB: d1 }), d1);
  assert.throws(() => getDatabase({ MANCHESTER_STORAGE_BACKEND: "turso" }), /URL or authentication token is missing/);
  const db = getDatabase({
    MANCHESTER_STORAGE_BACKEND: "turso",
    TURSO_DATABASE_URL: "libsql://example-org.turso.io",
    TURSO_AUTH_TOKEN: "test-token"
  });
  assert.ok(db instanceof TursoDatabase);
});
