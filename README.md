# kadaster-open-data (Agent Plugin)

Zero-dependency Node (>=18) stdio MCP server wrapping the **open, key-less** Kadaster datasets published via PDOK.

| Tool | What it does | Upstream |
|---|---|---|
| `kadaster_search_address` | Geocode free text or postcode+number into Address records | PDOK Locatieserver v3.1 `/free` |
| `kadaster_reverse_geocode` | Nearest addresses to a WGS84 point | PDOK Locatieserver v3.1 `/reverse` |
| `kadaster_parcel` | Cadastral parcel at a point/address or by designation (`ASD04-F-6346`) | BRK Kadastrale Kaart OGC API v1 `perceel` |
| `kadaster_building` | BAG pand at a point/address or by id, with units (verblijfsobjecten) | BAG OGC API v2 `pand`, `verblijfsobject` |

## Shapes
- **Address** `{id, label, street, houseNumber, houseLetter, addition, postcode, city, municipality, municipalityCode, province, lat, lon, verblijfsobjectId, parcels[]}`
- **Parcel** `{id, designation, cadastralMunicipality, cadastralMunicipalityCode, section, number, areaM2, areaType, centroid, validFrom}`
- **Building** `{id, constructionYear, status, use, unitCount, centroid, units[{id, address, postcode, city, floorAreaM2, use, status}], unitsTruncated}`

## Install (Cursor IDE)
```sh
git clone https://github.com/johvande/kadaster-open-data.git ~/.cursor/plugins/local/kadaster-open-data
```
Then reload Cursor (Developer: Reload Window). Requires Node 18 or newer on your PATH.

## Local proof
`./proof/run.sh` sends real MCP JSON-RPC requests over stdio to the live PDOK endpoints. `proof/output.jsonl` holds a captured run.

## Not included (need a key / contract / payment)
BAG API Individuele Bevragingen (`api.bag.kadaster.nl`, API key; returns 401 without one), Kadaster eigendomsinformatie / KIK / Mijn Kadaster (paid, account), BRK-Bevragen (contract).

## Data licence & attribution
- BAG (OGC API v2): **Public Domain Mark 1.0** (per the API's landing-page `license` link).
- BRK Kadastrale Kaart (OGC API v1): **CC BY 4.0**, attribute "Kadaster".
- PDOK Locatieserver: open data (CC0 per PDOK); subject to the PDOK Producten- en Diensten Catalogus voor Afnemers. The Nationaal Georegister metadata is authoritative.

Source: Kadaster / PDOK, https://www.pdok.nl. Code: MIT.
