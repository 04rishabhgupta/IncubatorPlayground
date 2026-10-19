import type { FloorArea } from "./geometry";
import type { MapCompany, MapSpace } from "./queries";

/**
 * Floor search. A query matches when every word in it appears somewhere in
 * the item (case- and accent-insensitive), so "rao ai" finds Asha Rao at an AI
 * company. Results say *why* they matched when it isn't obvious from the name,
 * e.g. "Team: Asha Rao" or "Amenity: Coffee machine".
 */

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

const words = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

type Field = { text: string; reason?: string };

/** The fields that matched, or null when some word matched nothing. */
function match(fields: Field[], query: string) {
  const terms = words(query);
  if (!terms.length) return { reason: null };
  const haystack = fields.map((f) => ({ ...f, norm: normalize(f.text) }));
  let reason: string | null = null;
  for (const term of terms) {
    const hit = haystack.find((f) => f.norm.includes(term));
    if (!hit) return null;
    // Prefer the first non-obvious reason (team member, amenity …) for display.
    if (!reason && hit.reason) reason = hit.reason;
  }
  return { reason };
}

export type SearchHit = { reason: string | null };

export function matchCompany(
  company: MapCompany,
  space: MapSpace | undefined,
  query: string,
): SearchHit | null {
  const fields: Field[] = [
    { text: company.name },
    { text: company.industry?.name ?? "" },
    { text: space ? `${space.code} ${space.label}` : "" },
    { text: company.tagline ?? "" }, // already on the card, so no reason needed
    ...company.team.flatMap((m) => [
      { text: m.full_name, reason: `Team: ${m.full_name}` },
      { text: m.job_title ?? "", reason: m.job_title ? `Team: ${m.full_name}, ${m.job_title}` : undefined },
    ]),
  ];
  return match(fields, query);
}

const areaKindLabel: Record<FloorArea["kind"], string> = {
  corridor: "Corridor",
  lounge: "Lounge",
  pantry: "Pantry",
  restroom: "Restroom",
  stairs: "Stairs",
  lift: "Lift",
  lift_lobby: "Lift lobby",
  phone_booth: "Phone booth",
  storage: "Storage",
  event: "Event space",
  terrace: "Terrace",
  other: "Shared space",
};

export function areaKindName(kind: FloorArea["kind"]) {
  return areaKindLabel[kind];
}

export function matchArea(area: FloorArea, query: string): SearchHit | null {
  return match(
    [
      { text: area.label ?? "" },
      { text: areaKindLabel[area.kind] },
      // Amenities before the description, so "coffee" explains itself as an amenity.
      ...(area.info?.amenities ?? []).map((a) => ({ text: a, reason: `Amenity: ${a}` })),
      { text: area.info?.description ?? "" },
    ],
    query,
  );
}

/** Shared rooms (boardroom, reception) and vacant offices. */
export function matchSpace(space: MapSpace, query: string): SearchHit | null {
  return match([{ text: space.label }, { text: space.code }], query);
}
