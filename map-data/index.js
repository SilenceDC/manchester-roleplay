
let mapLastIndexedAt = 0;

const json = (value, status = 200, extraHeaders = {}) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  }
});

const bounded = (n, min, max) => Math.max(min, Math.min(max, n));
const text = (v, max = 120) => String(v ?? "").slice(0, max).trim();

function normalizeMapText(value) {
  return String(value ?? "").toLowerCase().replace(/[.,#]/g, " ")
    .replace(/\bave\b/g, "avenue").replace(/\bst\b/g, "street")
    .replace(/\brd\b/g, "road").replace(/\bblvd\b/g, "boulevard")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function getLocation(item) {
  const loc = item?.Location || item?.location || {};
  if (!loc || typeof loc !== "object") return null;
  return loc;
}

function readWorldCoordinates(item, loc) {
  const x = Number(loc?.LocationX ?? loc?.x ?? item?.LocationX ?? item?.x);
  const z = Number(loc?.LocationZ ?? loc?.z ?? item?.LocationZ ?? item?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

async function indexSnapshot(db, snapshot) {
  const items = [
    ...(Array.isArray(snapshot.players) ? snapshot.players : []),
    ...(Array.isArray(snapshot.vehicles) ? snapshot.vehicles : []),
    ...(Array.isArray(snapshot.emergencyCalls) ? snapshot.emergencyCalls : [])
  ];
  const now = new Date().toISOString();
  const statements = [];
  for (const item of items) {
    const loc = getLocation(item);
    if (!loc) continue;
    const street = text(loc.StreetName || loc.street, 120);
    const postal = text(loc.PostalCode ?? loc.postal, 16);
    const building = text(loc.BuildingNumber ?? loc.building, 32);
    const coords = readWorldCoordinates(item, loc);
    const streetNorm = normalizeMapText(street);
    const buildingNorm = normalizeMapText(building);
    if (!streetNorm || !coords || /^(roadalignmentindicator|whiteline|collisionpart)/.test(streetNorm)) continue;
    const id = [postal.toLowerCase(), streetNorm, buildingNorm].join("|").slice(0, 240);
    statements.push(db.prepare(
      "INSERT INTO map_locations (id,postal_code,street_name,street_norm,building_number,building_norm,world_x,world_z,sample_count,first_seen,last_seen,source) VALUES (?,?,?,?,?,?,?,?,1,?,?,'prc-v2') ON CONFLICT(id) DO UPDATE SET world_x=((map_locations.world_x*map_locations.sample_count)+excluded.world_x)/(map_locations.sample_count+1),world_z=((map_locations.world_z*map_locations.sample_count)+excluded.world_z)/(map_locations.sample_count+1),sample_count=map_locations.sample_count+1,last_seen=excluded.last_seen"
    ).bind(id, postal, street, streetNorm, building, buildingNorm, coords.x, coords.z, now, now));
  }
  for (let i = 0; i < statements.length; i += 80) {
    await db.batch(statements.slice(i, i + 80));
  }
  await db.prepare(
    "INSERT INTO map_sync_state(key,value,updated_at) VALUES('last_live_snapshot',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
  ).bind(String(snapshot.fetchedAt || now), now).run();
  return { indexedRecords: statements.length, observedEntities: items.length, indexedAt: now };
}

function mapPxToLegacy(mapPxX, mapPxY) {
  return {
    LocationX: (Number(mapPxX) - 503.6) / 22,
    LocationZ: (Number(mapPxY) - 507.6) / 22
  };
}

function mapToLegacyFormula(apiLocationX, apiLocationZ) {
  // ERLC Tools' published Fall 2026 transform:
  // mapPxX = 22.222222... * API LocationX + 508.533
  // mapPxY = 22.222222... * API LocationZ + 512.867
  // The CAD map is 120,000 px square; its existing renderer normalizes to 0..1000.
  const mapPxX = (2000 / 90) * Number(apiLocationX) + 508.533;
  const mapPxY = (2000 / 90) * Number(apiLocationZ) + 512.867;
  return mapPxToLegacy(mapPxX, mapPxY);
}

function transformLiveItems(items, calibration) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const loc = getLocation(item);
    if (!loc) continue;
    const coords = readWorldCoordinates(item, loc);
    if (!coords) continue;
    const transformed = mapToLegacyFormula(coords.x, coords.z, calibration);
    loc.LocationX = transformed.LocationX;
    loc.LocationZ = transformed.LocationZ;
    if (loc.x !== undefined) loc.x = transformed.LocationX;
    if (loc.z !== undefined) loc.z = transformed.LocationZ;
  }
}

async function buildLocationIndex(db) {
  const [streets, postals, stats, staticRows, staticStats, prefixRows] = await Promise.all([
    db.prepare(
      "SELECT postal_code,street_name,AVG(world_x) AS world_x,AVG(world_z) AS world_z,SUM(sample_count) AS sample_count,MAX(last_seen) AS last_seen FROM map_locations WHERE street_norm<>'' GROUP BY postal_code,street_norm ORDER BY MAX(last_seen) DESC LIMIT 800"
    ).all(),
    db.prepare(
      "SELECT postal_code,AVG(world_x) AS world_x,AVG(world_z) AS world_z,SUM(sample_count) AS sample_count,MAX(last_seen) AS last_seen FROM map_locations WHERE postal_code<>'' GROUP BY postal_code ORDER BY MAX(last_seen) DESC LIMIT 150"
    ).all(),
    db.prepare("SELECT COUNT(*) AS count FROM map_locations").first(),
    db.prepare(
      "SELECT kind,label,postal_code,building_number,map_x,map_y FROM map_static_places WHERE kind IN ('postal','building_number','landmark','building','job') ORDER BY kind,label LIMIT 600"
    ).all(),
    db.prepare("SELECT COUNT(*) AS count FROM map_static_places").first(),
    db.prepare("SELECT p.postal_code FROM map_static_places p JOIN map_static_places n ON n.kind='building_number' AND n.label LIKE p.postal_code || '%' WHERE p.kind='postal' GROUP BY p.postal_code").all()
  ]);

  const prefixPostals = new Set((prefixRows.results || []).map(row => String(row.postal_code || "")));
  const result = [];
  for (const row of staticRows.results || []) {
    const coords = mapPxToLegacy(Number(row.map_x), Number(row.map_y));
    const postal = String(row.postal_code || "");
    const postalLabel = row.kind === "postal" && prefixPostals.has(postal) ? "Postal " + postal : postal;
    const streetLabel = row.kind === "postal" && prefixPostals.has(postal) ? "Postal " + String(row.label || "") : String(row.label || "");
    result.push({
      Player: "Map directory",
      Team: "Civilian",
      Location: {
        StreetName: streetLabel,
        PostalCode: postalLabel,
        BuildingNumber: String(row.building_number || ""),
        LocationX: coords.LocationX,
        LocationZ: coords.LocationZ,
        MapKind: String(row.kind || "")
      }
    });
  }
  for (const row of streets.results || []) {
    const coords = mapToLegacyFormula(Number(row.world_x), Number(row.world_z));
    result.push({
      Player: "Observed map location",
      Team: "Civilian",
      Location: {
        StreetName: String(row.street_name || ""),
        PostalCode: String(row.postal_code || ""),
        LocationX: coords.LocationX,
        LocationZ: coords.LocationZ
      }
    });
  }
  for (const row of postals.results || []) {
    const coords = mapToLegacyFormula(Number(row.world_x), Number(row.world_z));
    const postal = String(row.postal_code || "");
    const postalLabel = prefixPostals.has(postal) ? "Postal " + postal : postal;
    result.push({
      Player: "Observed postal location",
      Team: "Civilian",
      Location: {
        StreetName: postalLabel,
        PostalCode: postalLabel,
        LocationX: coords.LocationX,
        LocationZ: coords.LocationZ
      }
    });
  }
  return {
    items: result,
    count: Number(stats?.count || 0),
    staticCount: Number(staticStats?.count || 0),
    prefixPostals: [...prefixPostals]
  };
}

function addCors(headers, origin) {
  const h = new Headers(headers);
  if (origin) {
    h.set("access-control-allow-origin", origin);
    h.set("vary", "Origin");
  }
  return h;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originUrl = new URL("https://data" + url.pathname + url.search);
    const upstreamRequest = new Request(originUrl.toString(), request);

    if (url.pathname === "/map/health" && request.method === "GET") {
      const row = await env.MAP_LOCATIONS_DB.prepare("SELECT COUNT(*) AS count FROM map_locations").first();
      const staticRow = await env.MAP_LOCATIONS_DB.prepare("SELECT COUNT(*) AS count FROM map_static_places").first();
      const state = await env.MAP_LOCATIONS_DB.prepare("SELECT value,updated_at FROM map_sync_state WHERE key='last_live_snapshot'").first();
      const calibration = await env.MAP_LOCATIONS_DB.prepare("SELECT world_min_x,world_max_x,world_min_z,world_max_z,image_key,method FROM map_calibration WHERE id=1").first();
      return json({
        ok: true,
        database: "manchester-roleplay-map-locations",
        indexedLocations: Number(row?.count || 0),
        referenceLocations: Number(staticRow?.count || 0),
        lastLiveSnapshot: state?.value || null,
        lastIndexedAt: state?.updated_at || null,
        calibration
      });
    }

    const upstream = await env.ORIGIN_DATA.fetch(upstreamRequest);
    if (url.pathname !== "/cad/live" || request.method !== "GET" || !upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    }

    let snapshot;
    try {
      snapshot = await upstream.clone().json();
    } catch {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    }
    if (!snapshot || snapshot.ok !== true) {
      return json(snapshot, upstream.status, Object.fromEntries(upstream.headers));
    }

    if (Date.now() - mapLastIndexedAt >= 30000) {
      mapLastIndexedAt = Date.now();
      const indexableSnapshot = { ...snapshot, players: Array.isArray(snapshot.players) ? [...snapshot.players] : [], vehicles: Array.isArray(snapshot.vehicles) ? [...snapshot.vehicles] : [], emergencyCalls: Array.isArray(snapshot.emergencyCalls) ? [...snapshot.emergencyCalls] : [] };
      ctx.waitUntil(indexSnapshot(env.MAP_LOCATIONS_DB, indexableSnapshot).catch(error => {
        console.error("Map location indexing failed; live CAD data was left intact.", String(error?.message || error));
      }));
    }

    let calibration;
    try {
      calibration = await env.MAP_LOCATIONS_DB.prepare(
        "SELECT world_min_x,world_max_x,world_min_z,world_max_z,image_key,method FROM map_calibration WHERE id=1"
      ).first();
    } catch (error) {
      console.error("Map calibration lookup failed; using default map bounds.", String(error?.message || error));
      calibration = null;
    }

    // Keep raw world coordinates in the dedicated map database, then translate the live
    // values for the current CAD renderer (which still uses its legacy plotting function).
    transformLiveItems(snapshot.players, calibration);
    transformLiveItems(snapshot.vehicles, calibration);
    transformLiveItems(snapshot.emergencyCalls, calibration);

    try {
      const index = await buildLocationIndex(env.MAP_LOCATIONS_DB);
      const liveKeys = new Set();
      for (const item of [
        ...(Array.isArray(snapshot.players) ? snapshot.players : []),
        ...(Array.isArray(snapshot.vehicles) ? snapshot.vehicles : []),
        ...(Array.isArray(snapshot.emergencyCalls) ? snapshot.emergencyCalls : [])
      ]) {
        const loc = getLocation(item);
        if (!loc) continue;
        liveKeys.add([
          String(loc.PostalCode ?? loc.postal ?? "").toLowerCase(),
          normalizeMapText(loc.StreetName || loc.street)
        ].join("|"));
      }
      const synthetic = index.items.filter(item => {
        const loc = item.Location;
        const key = [String(loc.PostalCode || "").toLowerCase(), normalizeMapText(loc.StreetName)].join("|");
        return !liveKeys.has(key);
      });
      snapshot.mapLocations = {
        items: synthetic,
        indexedLocations: index.count,
        referenceLocations: index.staticCount,
        availableSearchEntries: synthetic.length,
        attribution: "Map reference data by ERLC Tools (https://erlc-tools.com); free to use, credit appreciated",
        calibration: "ERLC Tools Fall 2026 published API/map transform"
      };
      // The current CAD resolver searches liveSnapshot.players. Civilian entries
      // are intentionally skipped by the map renderer, so they are searchable
      // without drawing hundreds of fake vehicle/player markers.
      snapshot.players = [...(Array.isArray(snapshot.players) ? snapshot.players : []), ...synthetic.map(item => ({ ...item, Team: "Civilian" }))];
    } catch (error) {
      console.error("Could not attach stored map locations; live CAD data remains available.", String(error?.message || error));
    }

    const headers = new Headers(upstream.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify(snapshot), { status: upstream.status, headers });
  }
};