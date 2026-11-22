
let mapLastIndexedAt = 0;
let mapLastDiagnosticAt = 0;

function diagnosticPlayerMatches(item, identifier) {
  const expected = String(identifier ?? "").trim();
  if (!expected) return false;
  const player = String(item?.Player || item?.player || item?.username || "").trim();
  const separator = player.lastIndexOf(":");
  const playerName = separator >= 0 ? player.slice(0, separator).trim() : player;
  const playerId = separator >= 0 ? player.slice(separator + 1).trim() : "";
  if (/^\d+$/.test(expected)) return playerId === expected;
  return playerName.toLowerCase() === expected.toLowerCase();
}

function diagnosticLocation(loc) {
  if (!loc || typeof loc !== "object") return null;
  const result = {};
  for (const key of ["LocationX", "LocationZ", "PostalCode", "StreetName", "BuildingNumber"]) {
    if (loc[key] !== undefined) result[key] = loc[key];
  }
  return result;
}

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


const PUBLISHED_MAP_SCALE = 2000 / 90;
const PUBLISHED_MAP_OFFSET_X = 508.533;
const PUBLISHED_MAP_OFFSET_Y = 512.867;
const CALIBRATION_INLIER_LIMIT = 1400;
const CALIBRATION_MIN_ANCHORS = 6;

function weightedLineFit(points, worldKey, mapKey) {
  let weightSum = 0;
  let worldSum = 0;
  let mapSum = 0;
  for (const point of points) {
    const weight = Math.min(4, Math.max(1, Number(point.sample_count) || 1));
    weightSum += weight;
    worldSum += Number(point[worldKey]) * weight;
    mapSum += Number(point[mapKey]) * weight;
  }
  if (!weightSum) return null;
  const worldMean = worldSum / weightSum;
  const mapMean = mapSum / weightSum;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const weight = Math.min(4, Math.max(1, Number(point.sample_count) || 1));
    const worldDelta = Number(point[worldKey]) - worldMean;
    covariance += weight * worldDelta * (Number(point[mapKey]) - mapMean);
    variance += weight * worldDelta * worldDelta;
  }
  if (variance <= 1e-9) return null;
  const scale = covariance / variance;
  return { scale, offset: mapMean - scale * worldMean };
}

function median(values) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function fitAxisCalibration(points, worldKey, mapKey) {
  if (!Array.isArray(points) || points.length < CALIBRATION_MIN_ANCHORS) return null;
  let best = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const worldA = Number(points[i][worldKey]);
      const worldB = Number(points[j][worldKey]);
      const mapA = Number(points[i][mapKey]);
      const mapB = Number(points[j][mapKey]);
      const deltaWorld = worldB - worldA;
      if (!Number.isFinite(deltaWorld) || Math.abs(deltaWorld) < 150) continue;
      const scale = (mapB - mapA) / deltaWorld;
      if (!Number.isFinite(scale) || scale < 18 || scale > 26) continue;
      const offset = mapA - scale * worldA;
      const inliers = points.filter(point =>
        Math.abs(Number(point[mapKey]) - (scale * Number(point[worldKey]) + offset)) <= CALIBRATION_INLIER_LIMIT
      );
      if (inliers.length < CALIBRATION_MIN_ANCHORS) continue;
      const support = inliers.reduce((sum, point) => sum + Math.min(4, Math.max(1, Number(point.sample_count) || 1)), 0);
      const residualMedian = median(inliers.map(point =>
        Math.abs(Number(point[mapKey]) - (scale * Number(point[worldKey]) + offset))
      ));
      const score = [support, inliers.length, -residualMedian];
      if (!best || score[0] > best.score[0] ||
        (score[0] === best.score[0] && score[1] > best.score[1]) ||
        (score[0] === best.score[0] && score[1] === best.score[1] && score[2] > best.score[2])) {
        best = { score, inliers };
      }
    }
  }
  if (!best) return null;
  const fitted = weightedLineFit(best.inliers, worldKey, mapKey);
  if (!fitted || fitted.scale < 18 || fitted.scale > 26) return null;
  const refined = points.filter(point =>
    Math.abs(Number(point[mapKey]) - (fitted.scale * Number(point[worldKey]) + fitted.offset)) <= CALIBRATION_INLIER_LIMIT
  );
  if (refined.length < CALIBRATION_MIN_ANCHORS) return null;
  const finalFit = weightedLineFit(refined, worldKey, mapKey);
  if (!finalFit || finalFit.scale < 18 || finalFit.scale > 26) return null;
  const worldValues = refined.map(point => Number(point[worldKey]));
  const worldSpan = Math.max(...worldValues) - Math.min(...worldValues);
  const errors = refined.map(point =>
    Math.abs(Number(point[mapKey]) - (finalFit.scale * Number(point[worldKey]) + finalFit.offset))
  );
  if (worldSpan < 1200 || median(errors) > 850 || percentile(errors, 0.9) > 1400) return null;
  return {
    ...finalFit,
    inlierIds: new Set(refined.map(point => String(point.id))),
    anchorCount: refined.length,
    worldSpan,
    medianError: median(errors),
    p90Error: percentile(errors, 0.9)
  };
}

function fitMapCalibration(points) {
  if (!Array.isArray(points)) return null;
  const valid = points.filter(point =>
    point && point.id !== undefined &&
    [point.world_x, point.world_z, point.map_x, point.map_y].every(value => Number.isFinite(Number(value)))
  );
  const xFit = fitAxisCalibration(valid, "world_x", "map_x");
  const zFit = fitAxisCalibration(valid, "world_z", "map_y");
  if (!xFit || !zFit) return null;
  const common = valid.filter(point =>
    xFit.inlierIds.has(String(point.id)) && zFit.inlierIds.has(String(point.id))
  );
  if (common.length < CALIBRATION_MIN_ANCHORS) return null;
  const x = weightedLineFit(common, "world_x", "map_x");
  const z = weightedLineFit(common, "world_z", "map_y");
  if (!x || !z || x.scale < 18 || x.scale > 26 || z.scale < 18 || z.scale > 26) return null;
  const errors = common.map(point => Math.hypot(
    Number(point.map_x) - (x.scale * Number(point.world_x) + x.offset),
    Number(point.map_y) - (z.scale * Number(point.world_z) + z.offset)
  ));
  if (median(errors) > 1100 || percentile(errors, 0.9) > 1800) return null;
  return {
    mode: "multi-point-affine",
    method: "Robust multi-point fit from matching postal-code and building-number references",
    scale_x: x.scale,
    offset_x: x.offset,
    scale_z: z.scale,
    offset_z: z.offset,
    anchor_count: common.length,
    sample_count: common.reduce((sum, point) => sum + (Number(point.sample_count) || 1), 0),
    median_error_px: median(errors) / 120,
    p90_error_px: percentile(errors, 0.9) / 120,
    x_world_span: xFit.worldSpan,
    z_world_span: zFit.worldSpan
  };
}

function mapToLegacyFormula(apiLocationX, apiLocationZ, calibration = null) {
  // ER:LC Tools' verified Fall 2026 map conversion. API LocationX/LocationZ
  // are half-stud map units, not world studs. The Fall map is rotated 90°:
  // map X follows world Z; map Y runs opposite world X. The exact conversion
  // to the 120,000px Fall map is 2000/180 px per world stud.
  // API -> Fall map pixels: X = 22.222... * LocationX + 508.533...
  //                         Y = 22.222... * LocationZ + 512.867...
  // Do not override this with a fitted calibration; the official transform
  // was checked against live in-game positions and postal/building markers.
  const mapPxX = PUBLISHED_MAP_SCALE * Number(apiLocationX) + PUBLISHED_MAP_OFFSET_X;
  const mapPxY = PUBLISHED_MAP_SCALE * Number(apiLocationZ) + PUBLISHED_MAP_OFFSET_Y;
  return mapPxToLegacy(mapPxX, mapPxY);
}

async function loadMapCalibration(db) {
  const [base, anchors] = await Promise.all([
    db.prepare(
      "SELECT world_min_x,world_max_x,world_min_z,world_max_z,image_key,method FROM map_calibration WHERE id=1"
    ).first(),
    db.prepare(
      "SELECT p.id AS id,p.building_number AS building_number," +
      "SUM(l.world_x*l.sample_count)/SUM(l.sample_count) AS world_x," +
      "SUM(l.world_z*l.sample_count)/SUM(l.sample_count) AS world_z," +
      "SUM(l.sample_count) AS sample_count,p.map_x AS map_x,p.map_y AS map_y " +
      "FROM map_locations l JOIN map_static_places p " +
      "ON p.kind='building_number' AND p.building_number=l.building_number " +
      "AND (l.postal_code='' OR l.postal_code=p.postal_code) " +
      "WHERE l.building_number<>'' GROUP BY p.id,p.building_number,p.map_x,p.map_y"
    ).all()
  ]);
  const calibration = { ...(base || {}) };
  const fit = fitMapCalibration(anchors?.results || []);
  if (fit) return { ...calibration, ...fit };
  // Last verified production multi-point fit. Keep this available when D1's
  // daily read quota is exhausted so live player positions do not revert to
  // the less accurate published-map fallback.
  return {
    ...calibration,
    mode: "multi-point-affine",
    method: "Last verified production multi-point fit (D1-independent fallback)",
    scale_x: 22.463000459353964,
    offset_x: -397.7855357723238,
    scale_z: 22.481326258065888,
    offset_z: -294.2769618686725,
    anchor_count: 9,
    median_error_px: 5.725,
    p90_error_px: 9.56
  };
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

async function buildLocationIndex(db, calibration = null) {
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
    const coords = mapToLegacyFormula(Number(row.world_x), Number(row.world_z), calibration);
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
    const coords = mapToLegacyFormula(Number(row.world_x), Number(row.world_z), calibration);
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
      const [row, staticRow, state, calibration] = await Promise.all([
        env.MAP_LOCATIONS_DB.prepare("SELECT COUNT(*) AS count FROM map_locations").first(),
        env.MAP_LOCATIONS_DB.prepare("SELECT COUNT(*) AS count FROM map_static_places").first(),
        env.MAP_LOCATIONS_DB.prepare("SELECT value,updated_at FROM map_sync_state WHERE key='last_live_snapshot'").first(),
        loadMapCalibration(env.MAP_LOCATIONS_DB)
      ]);
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

    // Temporary, read-only diagnostic. Fail closed unless a single player
    // identifier is explicitly configured as the DIAG_PLAYER Worker secret.
    const diagnosticPlayer = String(env.DIAG_PLAYER || "").trim();
    const diagnosticPlayers = diagnosticPlayer && Date.now() - mapLastDiagnosticAt >= 30000
      ? (Array.isArray(snapshot.players) ? snapshot.players
          .filter(item => diagnosticPlayerMatches(item, diagnosticPlayer))
          .map(item => ({
            player: text(item?.Player || item?.player || item?.username, 80),
            rawLocation: diagnosticLocation(getLocation(item))
          })) : [])
      : null;
    if (diagnosticPlayers?.length) mapLastDiagnosticAt = Date.now();

    if (Date.now() - mapLastIndexedAt >= 30000) {
      mapLastIndexedAt = Date.now();
      const indexableSnapshot = { ...snapshot, players: Array.isArray(snapshot.players) ? [...snapshot.players] : [], vehicles: Array.isArray(snapshot.vehicles) ? [...snapshot.vehicles] : [], emergencyCalls: Array.isArray(snapshot.emergencyCalls) ? [...snapshot.emergencyCalls] : [] };
      ctx.waitUntil(indexSnapshot(env.MAP_LOCATIONS_DB, indexableSnapshot).catch(error => {
        console.error("Map location indexing failed; live CAD data was left intact.", String(error?.message || error));
      }));
    }

    let calibration;
    try {
      calibration = await loadMapCalibration(env.MAP_LOCATIONS_DB);
    } catch (error) {
      console.error("Map calibration lookup failed; using last verified multi-point fit.", String(error?.message || error));
      calibration = {
        mode: "multi-point-affine",
        method: "Last verified production multi-point fit (D1-independent fallback)",
        scale_x: 22.463000459353964,
        offset_x: -397.7855357723238,
        scale_z: 22.481326258065888,
        offset_z: -294.2769618686725,
        anchor_count: 9,
        median_error_px: 5.725,
        p90_error_px: 9.56
      };
    }

    // Keep raw world coordinates in the dedicated map database, then translate the live
    // values for the current CAD renderer (which still uses its legacy plotting function).
    transformLiveItems(snapshot.players, calibration);
    transformLiveItems(snapshot.vehicles, calibration);
    transformLiveItems(snapshot.emergencyCalls, calibration);

    if (diagnosticPlayers?.length) {
      const diagnostic = diagnosticPlayers.map(entry => {
        const transformedItem = snapshot.players.find(item =>
          diagnosticPlayerMatches(item, diagnosticPlayer)
        );
        return {
          player: entry.player,
          rawLocation: entry.rawLocation,
          transformedLocation: diagnosticLocation(getLocation(transformedItem))
        };
      }).filter(entry => entry.rawLocation);
      if (diagnostic.length) {
        console.info("[CAD_MAP_DIAGNOSTIC]", JSON.stringify({
          capturedAt: new Date().toISOString(),
          players: diagnostic
        }));
      }
    }

    try {
      const index = await buildLocationIndex(env.MAP_LOCATIONS_DB, calibration);
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
        calibration: calibration?.mode || "published-fallback", calibrationDetails: calibration
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