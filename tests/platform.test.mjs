import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const bot = await readFile(new URL("../bot/index.js", import.meta.url), "utf8");
const map = await readFile(new URL("../map-data/index.js", import.meta.url), "utf8");

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

const automodViolation = loadAutomod(bot);
const { mapPxToLegacy, mapToLegacyFormula } = loadMapTransforms(map);

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

test("map API transform uses the published Fall 2026 offset", () => {
  const result = mapToLegacyFormula(0, 0);
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
  assert.match(bot, /recovery scan is continuing; another pass is scheduled/);
});
