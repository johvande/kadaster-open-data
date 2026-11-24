#!/usr/bin/env bash
# Drives the stdio server with real JSON-RPC requests against live PDOK endpoints.
cd "$(dirname "$0")/.."
{
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"proof","version":"0"}}}'
echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kadaster_search_address","arguments":{"query":"Damrak 1 Amsterdam","limit":1}}}'
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"kadaster_search_address","arguments":{"postcode":"2513 aa","houseNumber":1,"limit":2}}}'
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"kadaster_parcel","arguments":{"address":"Damrak 1 Amsterdam"}}}'
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"kadaster_parcel","arguments":{"designation":"ASD04-F-6346"}}}'
echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"kadaster_building","arguments":{"address":"Damrak 1 Amsterdam","maxUnits":3}}}'
echo '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"kadaster_reverse_geocode","arguments":{"lat":52.37714,"lon":4.89804,"limit":2}}}'
echo '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"kadaster_parcel","arguments":{"designation":"nonsense"}}}'
} | node server/index.mjs
