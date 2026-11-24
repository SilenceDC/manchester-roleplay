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
  const start = source.indexOf("function normalizeMapText");
  const end = source.indexOf("function addCors", start);
  assert.ok(start >= 0 && end > start, "map transform source block must exist");
  return vm.runInNewContext(source.slice(start, end) + "; ({ mapPxToLegacy, mapToLegacyFormula, fitMapCalibration, transformLiveItems })");
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
const { mapPxToLegacy, mapToLegacyFormula, fitMapCalibration, transformLiveItems } = loadMapTransforms(map);
const commandResponse = loadCommandResponse(bot);
const slashCommands = loadSlashCommands(bot);

test("automod leaves ordinary conversation alone", () => {
  assert.equal(automodViolation("Welcome to Texas State Roleplay"), "");
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
    { id: "a", world_x: -3000, world_z: -2500, map_x: -67605, map_y: -56500, sample_count: 4 },
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

test("live map transform uses the published Fall conversion", () => {
  const result = mapToLegacyFormula(1250, -750, {});
  assert.deepEqual({ ...result }, {
    ...mapPxToLegacy((2000 / 90) * 1250 + 508.533, (2000 / 90) * -750 + 512.867)
  });
});
test("live player coordinates remain authoritative even when ER:LC reports a collision-part street", () => {
  const player = {
    Player: "Doggamer383:3574132593",
    Location: {
      LocationX: 2579.878,
      LocationZ: 3574.214,
      PostalCode: "315",
      StreetName: "CollisionPart_Curb",
      BuildingNumber: "3151"
    }
  };
  transformLiveItems([player], null);
  assert.deepEqual(
    { ...player.Location },
    {
      LocationX: mapToLegacyFormula(2579.878, 3574.214).LocationX,
      LocationZ: mapToLegacyFormula(2579.878, 3574.214).LocationZ,
      PostalCode: "315",
      StreetName: "CollisionPart_Curb",
      BuildingNumber: "3151"
    }
  );
});

test("map diagnostics fail closed and only capture the configured player by ID or case-insensitive username", () => {
  const start = map.indexOf("function diagnosticPlayerMatches");
  const end = map.indexOf("function diagnosticLocation", start);
  assert.ok(start >= 0 && end > start, "diagnostic player matcher must exist");
  const matches = vm.runInNewContext(map.slice(start, end) + "; diagnosticPlayerMatches");
  assert.equal(matches({ Player: "Mads:3574132593" }, "3574132593"), true);
  assert.equal(matches({ Player: "Other:3574132593" }, "3574132594"), false);
  assert.equal(matches({ Player: "mAdS:3574132593" }, "MADS"), true);
  assert.equal(matches({ Player: "Other:123" }, "Mads"), false);
  assert.equal(matches({ Player: "Mads:3574132593" }, ""), false);
  assert.ok(map.includes('String(env.DIAG_PLAYER || "").trim()'));
  assert.ok(map.includes("diagnosticPlayers?.length"));
  assert.ok(map.includes("mapLastDiagnosticAt"));
  assert.ok(map.includes("transformedLocation"));
  assert.ok(map.includes("diagnosticLocation(getLocation(item))"));
  assert.ok(map.indexOf("rawLocation: diagnosticLocation") < map.indexOf("transformLiveItems(snapshot.players, calibration)"));
  assert.ok(map.indexOf('console.info("[CAD_MAP_DIAGNOSTIC]"') > map.indexOf("transformLiveItems(snapshot.players, calibration)"));
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
  assert.match(bot, /scheduleGatewayTask\("recovery", Date\.now\(\) \+ 10000\)/);
  assert.match(bot, /Discord Gateway WebSocket error; reconnect scheduled/);
});

test("Gateway heartbeats and recovery retries share a single non-overwriting alarm queue", () => {
  const start = bot.indexOf("function nextGatewayAlarm");
  const end = bot.indexOf("const COMMANDS_VERSION", start);
  assert.ok(start >= 0 && end > start, "Gateway alarm selector must exist");
  const nextAlarm = vm.runInNewContext(bot.slice(start, end) + "; nextGatewayAlarm");
  assert.equal(nextAlarm({heartbeat:45000,recovery:10000,reconnect:5000}), 5000);
  assert.equal(nextAlarm({heartbeat:45000,recovery:10000}), 10000);
  assert.equal(nextAlarm({}), null);
  assert.match(bot, /async takeDueGatewayTasks/);
  assert.match(bot, /async mutateGatewayTasks/);
  assert.match(bot, /dueTasks\.has\("heartbeat"\)[\s\S]*?awaitingAck/);
  assert.doesNotMatch(bot, /this\.ctx\.storage\.setAlarm\(Date\.now\(\) \+ this\.heartbeatInterval\)/);
  assert.match(bot, /const COMMANDS_VERSION = "texas-state-roleplay-commands-v4"/);
});

test("recovery scans are deliberately bounded into small resumable batches", () => {
  assert.equal((bot.match(/new URLSearchParams\(\{ limit: "10" \}\)/g) || []).length, 2);
  assert.equal((bot.match(/for \(let page = 0; page < 1; page\+\+\)/g) || []).length, 2);
  assert.match(bot, /recovery scan is continuing; another pass is scheduled/i);
});

test("CAD map background alignment moves the image while preserving marker coordinates", () => {
  assert.ok(website.includes("transform:translate(-10.7px,12.4px)"));
  assert.ok(website.includes("MAP_BACKGROUND_OFFSET_X=-10.7,MAP_BACKGROUND_OFFSET_Y=12.4"));
  assert.ok(website.includes("mapX-MAP_BACKGROUND_OFFSET_X)/10"));
  assert.ok(website.includes("mapY-MAP_BACKGROUND_OFFSET_Y)/10"));
  assert.ok(website.includes(".marker-layer{position:absolute;inset:0;pointer-events:none}"));
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


test("all production entrypoints use Texas State Roleplay branding", () => {
  for (const [name, source] of [["bot", bot], ["website", website], ["data", data], ["map-data", map]]) {
    assert.match(source, /Texas State Roleplay|Texas State Police|Texas Fire &(?:amp;)? Rescue|Texas EMS|\bTexas\b/i, name + " is missing Texas branding");
  }
  for (const department of ["Texas State Police", "Texas Fire & Rescue", "Texas EMS"]) {
    assert.ok(bot.includes(department), "bot is missing department: " + department);
    assert.ok(website.includes(department.replace("&", "&amp;")) || website.includes(department), "website is missing department: " + department);
  }
});

test("bot's HTTP interaction endpoint handles Discord PING and slash commands", () => {
  assert.match(bot, /if \(interaction\.type === 1\)[\s\S]*?return json\(\{ type: 1 \}\)/);
  assert.match(bot, /interaction\.type === 2[\s\S]*?commandResponse\(name\)/);
  assert.match(bot, /ping: "Pong! Texas State Roleplay bot is online/);
});


test("the bot returns a valid immediate /ping response and Texas descriptions", () => {
  const response = commandResponse("ping");
  assert.equal(response.type, 4);
  assert.match(response.data.content, /Pong! Texas State Roleplay bot is online/);
  assert.match(slashCommands.find(command => command.name === "ping").description, /Texas State Roleplay/);
  assert.match(bot, /moderation_commands_version.*COMMANDS_VERSION/);
});


test("website caches live CAD snapshots and serves bounded stale data during upstream failures", () => {
  assert.match(website, /CAD_LIVE_CACHE_TTL_MS = 15000/);
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
          rows: [[{ type: "integer", value: "1" }, { type: "text", value: "Texas" }]],
          affected_row_count: 0
        } } },
        { type: "ok", response: { type: "close" } }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const db = new TursoDatabase("libsql://example-org.turso.io", "test-token");
    const row = await db.prepare("SELECT ? AS ok, ? AS label").bind(1, "Texas").first();
    assert.deepEqual(row, { ok: 1, label: "Texas" });
    assert.equal(requests[0].url, "https://example-org.turso.io/v2/pipeline");
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.deepEqual(requests[0].body.requests[0].stmt.args, [
      { type: "integer", value: "1" },
      { type: "text", value: "Texas" }
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

test("Texas data API keeps D1 as the safe default until an explicit Turso cutover", () => {
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


test("Texas State Roleplay workflow commands are registered", () => {
  const names = slashCommands.map(command => command.name);
  for (const name of ["server","ticket-panel","close-ticket","fastpass-panel","staff-record"]) assert.ok(names.includes(name), "missing workflow command: " + name);
  const server = slashCommands.find(command => command.name === "server");
  assert.equal(server.options.map(option => option.name).join(","), "start-up,shutdown,low-on-players,invite");
  const records = slashCommands.find(command => command.name === "staff-record");
  assert.equal(records.options.map(option => option.name).join(","), "promotion,infraction,warning,strike");
  const warning = records.options.find(option => option.name === "warning");
  const appealability = warning.options.find(option => option.name === "appealable");
  assert.equal(appealability.required, true);
  assert.equal(Array.from(appealability.choices, choice => choice.value).join(","), "yes,no");
});

test("ticket, Fast Pass, session and archive workflow routes are present", () => {
  for (const route of ["/workflow/ticket-create","/workflow/ticket-update","/workflow/ticket-ping","/workflow/fastpass-create","/workflow/fastpass-update","/workflow/record","/workflow/archive"]) {
    assert.ok(data.includes(route), "missing Turso workflow route: " + route);
  }
  for (const fragment of ["ticketComponent","ticketTranscript","fastpassModal","fastpassComponent","archiveInGameLogs","serverSessionCommand","staffRecordCommand"]) {
    assert.ok(bot.includes("function " + fragment) || bot.includes("async function " + fragment), "missing Discord workflow handler: " + fragment);
  }
  for (const channel of ["1574355318560002118","1574355361627111506","1574357055840587886","1574357769266528306","1574357807484899418","1574355077861351454","1574355190536998912","1574358164722159739","1574355158727393361","1574355114469101670"]) {
    assert.ok(bot.includes(channel), "missing configured workflow channel: " + channel);
  }
});


test("private ticket channels explicitly grant the bot access", () => {
  const start = bot.indexOf("async function createTicket");
  const end = bot.indexOf("\\nasync function ticketByChannel", start);
  const create = bot.slice(start, end);
  assert.ok(create.includes('{id:GUILD_ID,type:0,allow:"0",deny:"1024"}'), "ticket should remain hidden from @everyone");
  assert.ok(create.includes('{id:APP_ID,type:1,allow:viewSend,deny:"0"}'), "bot must be explicitly allowed into private ticket channels");
  assert.ok(bot.includes('Discord channel post failed (HTTP "+r.status+"):'), "Discord API errors should include the permission detail");
});

test("Fast Pass collects native Discord file uploads and archives the files in the review channel", () => {
  assert.ok(bot.includes('type:19,custom_id:"proof_files"'));
  assert.ok(bot.includes("interaction.data?.resolved?.attachments"));
  assert.ok(bot.includes("discordUploadAttachments(env,CHANNELS.fastpassReview"));
  assert.ok(data.includes("proofFiles = Array.isArray(item.proofFiles)"));
  assert.ok(bot.includes('file_types:["image","video",".pdf"]'));
});

test("server shutdown captures available ER:LC and website logs before posting the shutdown notice", () => {
  const archive = bot.indexOf("async function archiveInGameLogs");
  const session = bot.indexOf("async function serverSessionCommand");
  const shutdown = bot.indexOf('if(action==="shutdown")', session);
  const call = bot.indexOf("await archiveInGameLogs(env,sessionId)", shutdown);
  const post = bot.indexOf('discordChannelMessage(env,CHANNELS.sessions', shutdown);
  assert.ok(archive >= 0 && session > 0 && shutdown > session && call > shutdown && post > call);
  for (const name of ["CommandLogs","ModCalls","JoinLogs","KillLogs"]) assert.ok(bot.includes('"'+name+'"'));
  assert.ok(bot.includes('CHANNELS.logArchive'));
  assert.ok(bot.includes("erlcLogsAvailable:!erlcError"));
});


test("gateway start refreshes the guild slash-command registration", () => {
  assert.ok(bot.includes('const registration = await registerCommands(env);'));
  assert.ok(bot.includes('commands:registration.registered||[]'));
});


test("shutdown log archive exports website moderation logs and only clears Turso after Discord upload", () => {
  assert.ok(data.includes("/workflow/modlogs-export"));
  assert.ok(data.includes("/workflow/modlogs-clear"));
  const start = bot.indexOf("async function archiveInGameLogs");
  const upload = bot.indexOf("const message = await discordFileMessage",start);
  const clear = bot.indexOf('workflowData(env,"/workflow/modlogs-clear","POST"',start);
  assert.ok(start >= 0 && upload > start && clear > upload, "Turso logs must only be cleared after Discord confirms the archive upload");
  assert.ok(bot.includes("websiteModerationLogs"));
  assert.ok(bot.includes("websiteLogsDeleted"));
});


test("session lifecycle gates website logs and archives before ending the session", () => {
  assert.ok(bot.includes('sessions:"1574355077861351454"'));
  assert.ok(bot.includes('logArchive:"1574355077861351454"'));
  assert.ok(data.includes("/workflow/session-start"));
  assert.ok(data.includes("/workflow/session-status"));
  assert.ok(data.includes("/workflow/session-end"));
  assert.ok(data.includes('if (!active?.value) return reply({logs:[],active:false})'));
  const shutdown = bot.indexOf('if(action==="shutdown")');
  const archive = bot.indexOf("await archiveInGameLogs(env,sessionId)", shutdown);
  const upload = bot.indexOf("const message = await discordFileMessage(env,CHANNELS.logArchive", bot.indexOf("async function archiveInGameLogs"));
  const clear = bot.indexOf('workflowData(env,"/workflow/modlogs-clear","POST"', bot.indexOf("async function archiveInGameLogs"));
  const end = bot.indexOf('workflowData(env,"/workflow/session-end","POST"', bot.indexOf("async function archiveInGameLogs"));
  assert.ok(shutdown >= 0 && archive > shutdown);
  assert.ok(upload > 0 && clear > upload && end > clear, "archive upload must precede session cleanup and session end");
});

test("Discord and website moderation attempts are audited independently of database storage", () => {
  assert.ok(bot.includes("async function auditedModerationRun"));
  assert.ok(bot.includes('auditedModerationRun(env,interaction,name,"Discord")'));
  assert.ok(bot.includes('auditedModerationRun(env,interaction,action,"Website")'));
  assert.ok(bot.includes("await sendModerationLog(env,"));
  assert.ok(bot.includes("Moderation audit database write failed; Discord log was attempted independently:"));
});

test("ER:LC API outage does not prevent the website session archive from reaching Discord", () => {
  const start = bot.indexOf("async function archiveInGameLogs");
  const end = bot.indexOf("\nasync function serverSessionCommand", start);
  const archive = bot.slice(start,end);
  assert.ok(archive.includes("catch(error){erlcError="));
  assert.ok(archive.includes("erlcLogsAvailable:!erlcError"));
  assert.ok(archive.includes("websiteModerationLogs"));
  assert.ok(archive.indexOf("const message = await discordFileMessage") > archive.indexOf("const storedLogs=await workflowData"));
});
