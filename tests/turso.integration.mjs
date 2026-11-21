import { TursoDatabase } from "../data/index.js";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_DATABASE;
if (!url || !token) throw new Error("Turso integration credentials are missing.");

const db = new TursoDatabase(url, token);
const expected = {
  announcements: 4,
  app_state: 1,
  ban_bolos: 3,
  cad_call_events: 8,
  cad_calls: 3,
  cad_unit_members: 0,
  cad_units: 0,
  formal_warnings: 1,
  moderation_logs: 83,
  retention_runs: 0,
  schema_migrations: 2
};

const health = await db.prepare("SELECT 1 AS ok").first();
if (health?.ok !== 1) throw new Error("Turso adapter health query failed.");

for (const [table, expectedCount] of Object.entries(expected)) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM \"" + table + "\"").first();
  const actual = Number(row?.count ?? -1);
  console.log(table + ": " + actual + " rows");
  if (actual !== expectedCount) {
    throw new Error("Turso adapter count mismatch for " + table + ": expected " + expectedCount + ", got " + actual);
  }
}
console.log("Turso adapter integration verification passed; all queries were read-only.");
