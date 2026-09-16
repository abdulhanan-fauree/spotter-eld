"""US state name -> USPS abbreviation.

The Remarks column is required to carry the state *abbreviation*: "you must list
the city, town, or village, and State abbreviation when a change of duty status
occurs" (guide p.17). Nominatim returns the full state name, so we need the map.

Where Nominatim supplies `ISO3166-2-lvl4` ("US-TX") we prefer that and never
consult this table; it exists for the responses that omit it.
"""

from __future__ import annotations

STATE_ABBREVIATIONS: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
    "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "puerto rico": "PR",
}


def abbreviate(state: str | None) -> str:
    if not state:
        return ""
    return STATE_ABBREVIATIONS.get(state.strip().lower(), state.strip())


def from_iso3166_2(code: str | None) -> str:
    """"US-TX" -> "TX". Returns "" for anything unrecognised."""
    if not code or "-" not in code:
        return ""
    country, _, sub = code.partition("-")
    return sub if country.upper() == "US" and len(sub) == 2 else ""
