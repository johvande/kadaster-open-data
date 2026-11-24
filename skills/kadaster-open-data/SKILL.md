---
name: kadaster-open-data
description: Use when the user asks about a Dutch (Netherlands) address, postcode, cadastral parcel (perceel / kadastrale aanduiding), or building (BAG pand: bouwjaar, gebruiksdoel, oppervlakte). Open Kadaster/PDOK data only; no ownership, prices or mortgages.
---

# Kadaster open data

Tools come from the `kadaster` MCP server in this plugin. All data is live from PDOK; never fill in values the tools did not return.

## When to call what

- **An address or postcode** → `kadaster_search_address` (`query` free text, or `postcode` + `houseNumber`). Gives lat/lon, BAG ids and linked parcel designations.
- **Coordinates, "what's here?"** → `kadaster_reverse_geocode` (`lat`, `lon`).
- **Parcel / kavel / perceel, plot size** → `kadaster_parcel` with `address`, `lat`+`lon`, or `designation` like `ASD04-F-6346`. `areaM2` is the registered cadastral area; `areaType` "Voorlopig" means provisional.
- **Building age, use, units, floor area** → `kadaster_building` with `address`, `lat`+`lon`, or `pandId`. `floorAreaM2` is per unit (verblijfsobject) gebruiksoppervlakte. Raise `maxUnits` for big buildings.

## Limits to tell the user

- Ownership, purchase prices, mortgages (eigendomsinformatie, KIK) are paid Kadaster products, not available here.
- Coverage is the Netherlands only. Coordinates are WGS84.
- Free-text search returns best matches, not exact; check the `label` against what the user meant.
- Credit "Kadaster / PDOK" when presenting results (BRK parcel data is CC BY 4.0).
