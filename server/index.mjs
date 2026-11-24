#!/usr/bin/env node
// Zero-dependency stdio MCP server for Dutch Kadaster open data (PDOK). No API key.
import { createInterface } from "node:readline";

const LS = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const BAG = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const BRK = "https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1";
const UA = "kadaster-open-data-mcp/0.1.0";

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}${new URL(url).pathname}`);
  return res.json();
}

// ---------- geometry helpers (CRS84: [lon, lat]) ----------
const parsePoint = (wkt) => {
  const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(wkt || "");
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
};
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polygons = (g) => (g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : []);
const containsPoint = (g, pt) => polygons(g).some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
function centroid(g) {
  let a = 0, cx = 0, cy = 0;
  for (const [ring] of polygons(g)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
  }
  if (!a) return null;
  return { lat: +(cy / (3 * a)).toFixed(7), lon: +(cx / (3 * a)).toFixed(7) };
}
const bboxAround = (lat, lon, d = 0.00002) => `${lon - d},${lat - d},${lon + d},${lat + d}`;

// ---------- shapes ----------
// Address = {id, label, street, houseNumber, houseLetter, addition, postcode, city, municipality, municipalityCode, province, lat, lon, verblijfsobjectId, parcels}
function toAddress(d) {
  const [lon, lat] = parsePoint(d.centroide_ll);
  return {
    id: d.nummeraanduiding_id ?? null,
    label: d.weergavenaam,
    street: d.straatnaam ?? null,
    houseNumber: d.huisnummer ?? null,
    houseLetter: d.huisletter ?? null,
    addition: d.huisnummertoevoeging ?? null,
    postcode: d.postcode ?? null,
    city: d.woonplaatsnaam ?? null,
    municipality: d.gemeentenaam ?? null,
    municipalityCode: d.gemeentecode ?? null,
    province: d.provincienaam ?? null,
    lat, lon,
    verblijfsobjectId: d.adresseerbaarobject_id ?? null,
    parcels: d.gekoppeld_perceel ?? [],
  };
}
// Parcel = {id, designation, cadastralMunicipality, cadastralMunicipalityCode, section, number, areaM2, areaType, centroid, validFrom}
function toParcel(f) {
  const p = f.properties;
  return {
    id: p.identificatie_lokaal_id,
    designation: `${p.akr_kadastrale_gemeente_code_waarde}-${p.sectie}-${p.perceelnummer}`,
    cadastralMunicipality: p.kadastrale_gemeente_waarde,
    cadastralMunicipalityCode: p.akr_kadastrale_gemeente_code_waarde,
    section: p.sectie,
    number: p.perceelnummer,
    areaM2: p.kadastrale_grootte_waarde,
    areaType: p.soort_grootte_waarde,
    centroid: centroid(f.geometry),
    validFrom: p.begin_geldigheid,
  };
}
// Building = {id, constructionYear, status, use, unitCount, centroid, footprintVertices, units[]}
// Unit(verblijfsobject) = {id, address, postcode, city, floorAreaM2, use, status}
function toUnit(f) {
  const p = f.properties;
  const nr = [p.huisnummer, p.huisletter, p.toevoeging].filter((x) => x != null && x !== "").join("");
  return {
    id: p.identificatie,
    address: `${p.openbare_ruimte_naam} ${nr}`.trim(),
    postcode: p.postcode, city: p.woonplaats_naam,
    floorAreaM2: p.oppervlakte, use: p.gebruiksdoel, status: p.status,
  };
}
async function toBuilding(f, maxUnits) {
  const p = f.properties;
  const hrefs = p["verblijfsobject.href"] || [];
  const units = await Promise.all(hrefs.slice(0, maxUnits).map((h) => getJson(`${h}?f=json`).then(toUnit).catch((e) => ({ error: e.message }))));
  return {
    id: p.identificatie,
    constructionYear: p.bouwjaar, status: p.status, use: p.gebruiksdoel,
    unitCount: p.aantal_verblijfsobjecten,
    centroid: centroid(f.geometry),
    units, unitsTruncated: hrefs.length > units.length,
  };
}

// ---------- tools ----------
async function searchAddress({ query, postcode, houseNumber, limit = 5 }) {
  let q = query;
  if (!q && postcode) q = `postcode:${postcode.replace(/\s/g, "").toUpperCase()}` + (houseNumber != null ? ` and huisnummer:${houseNumber}` : "");
  if (!q) throw new Error("Give `query`, or `postcode` (+ optional `houseNumber`).");
  const u = new URL(`${LS}/free`);
  u.search = new URLSearchParams({ q, fq: "type:adres", rows: String(Math.min(limit, 25)), fl: "*" });
  const d = await getJson(u);
  return { results: d.response.docs.map(toAddress) };
}

async function resolvePoint({ lat, lon, address }) {
  if (lat != null && lon != null) return { lat, lon, address: null };
  if (!address) throw new Error("Give `lat`+`lon` or `address`.");
  const r = await searchAddress({ query: address, limit: 1 });
  const a = r.results[0];
  if (!a) throw new Error(`No address found for "${address}".`);
  return { lat: a.lat, lon: a.lon, address: a };
}

async function parcel({ lat, lon, address, designation }) {
  if (designation) {
    const m = /^([A-Z]{3}\d{2})[\s-]+([A-Z]{1,2})[\s-]+(\d+)$/i.exec(designation.trim());
    if (!m) throw new Error('designation must look like "ASD04-F-6346" (gemeentecode-sectie-perceelnummer).');
    const u = new URL(`${BRK}/collections/perceel/items`);
    u.search = new URLSearchParams({ f: "json", akr_kadastrale_gemeente_code_waarde: m[1].toUpperCase(), sectie: m[2].toUpperCase(), perceelnummer: m[3] });
    const d = await getJson(u);
    return { parcels: d.features.map(toParcel) };
  }
  const pt = await resolvePoint({ lat, lon, address });
  const u = new URL(`${BRK}/collections/perceel/items`);
  u.search = new URLSearchParams({ f: "json", bbox: bboxAround(pt.lat, pt.lon), limit: "20" });
  const d = await getJson(u);
  const hit = d.features.filter((f) => containsPoint(f.geometry, [pt.lon, pt.lat]));
  return { point: { lat: pt.lat, lon: pt.lon }, resolvedAddress: pt.address?.label ?? null, parcels: hit.map(toParcel) };
}

async function building({ lat, lon, address, pandId, maxUnits = 10 }) {
  maxUnits = Math.max(0, Math.min(maxUnits, 50));
  const u = new URL(`${BAG}/collections/pand/items`);
  let pt = null;
  if (pandId) u.search = new URLSearchParams({ f: "json", identificatie: String(pandId) });
  else {
    pt = await resolvePoint({ lat, lon, address });
    u.search = new URLSearchParams({ f: "json", bbox: bboxAround(pt.lat, pt.lon), limit: "20" });
  }
  const d = await getJson(u);
  let feats = d.features;
  if (pt) {
    const inside = feats.filter((f) => containsPoint(f.geometry, [pt.lon, pt.lat]));
    // An address point can sit a hair outside the footprint; fall back to bbox hits.
    if (inside.length) feats = inside;
  }
  return {
    ...(pt ? { point: { lat: pt.lat, lon: pt.lon }, resolvedAddress: pt.address?.label ?? null } : {}),
    buildings: await Promise.all(feats.map((f) => toBuilding(f, maxUnits))),
  };
}

async function reverse({ lat, lon, limit = 5 }) {
  const u = new URL(`${LS}/reverse`);
  u.search = new URLSearchParams({ lat: String(lat), lon: String(lon), rows: String(Math.min(limit, 25)), type: "adres", fl: "*" });
  const d = await getJson(u);
  return { results: d.response.docs.map((x) => ({ ...toAddress(x), distanceM: x.afstand })) };
}

const pointProps = {
  lat: { type: "number", description: "Latitude (WGS84)" },
  lon: { type: "number", description: "Longitude (WGS84)" },
  address: { type: "string", description: "Free-text Dutch address; geocoded first if lat/lon are not given" },
};
const TOOLS = [
  {
    name: "kadaster_search_address",
    description: "Geocode a Dutch address (BAG via PDOK Locatieserver). Free text like 'Damrak 1 Amsterdam' or postcode+houseNumber. Returns normalized Address records with lat/lon, BAG ids and linked parcel designations.",
    inputSchema: { type: "object", properties: {
      query: { type: "string", description: "Free-text address" },
      postcode: { type: "string", description: "Dutch postcode, e.g. 1012LG" },
      houseNumber: { type: "integer" },
      limit: { type: "integer", default: 5, maximum: 25 },
    } },
    run: searchAddress,
  },
  {
    name: "kadaster_reverse_geocode",
    description: "Nearest Dutch addresses to a WGS84 point (PDOK Locatieserver reverse). Returns Address records with distance in metres.",
    inputSchema: { type: "object", properties: { lat: pointProps.lat, lon: pointProps.lon, limit: { type: "integer", default: 5, maximum: 25 } }, required: ["lat", "lon"] },
    run: reverse,
  },
  {
    name: "kadaster_parcel",
    description: "Cadastral parcel (BRK Kadastrale Kaart) at a point/address, or by designation like 'ASD04-F-6346'. Returns section, number, registered area (m²) and centroid. No ownership data (that is paid Kadaster data).",
    inputSchema: { type: "object", properties: { ...pointProps, designation: { type: "string", description: "Kadastrale aanduiding, e.g. ASD04-F-6346" } } },
    run: parcel,
  },
  {
    name: "kadaster_building",
    description: "BAG building(s) (pand) at a point/address or by 16-digit pand id: construction year, status, use, and its units (verblijfsobjecten) with floor area.",
    inputSchema: { type: "object", properties: { ...pointProps, pandId: { type: "string", description: "BAG pand identificatie (16 digits)" }, maxUnits: { type: "integer", default: 10, maximum: 50 } } },
    run: building,
  },
];

// ---------- JSON-RPC over stdio ----------
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize")
    return send({ id, result: { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kadaster-open-data", version: "0.1.0" } } });
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list") return send({ id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
    try {
      const out = await tool.run(params.arguments || {});
      return send({ id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out } });
    } catch (e) {
      return send({ id, result: { isError: true, content: [{ type: "text", text: String(e.message || e) }] } });
    }
  }
  if (id === undefined) return; // notifications
  send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
}
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: "Parse error" } }); }
  handle(req).catch((e) => send({ id: req.id ?? null, error: { code: -32603, message: String(e) } }));
});
