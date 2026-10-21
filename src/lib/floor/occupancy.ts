/**
 * Occupancy overview (Phase 4R.6): per floor, how many offices are taken,
 * desks against the people working there, and who asked for which office.
 * Pure so it can be unit tested; the admin page loads the rows.
 */

export type OccupancyOffice = {
  id: string;
  floor_id: string;
  code: string;
  label: string;
  capacity: number | null;
};
export type OccupancyCompany = {
  id: string;
  name: string;
  slug: string;
  space_id: string | null;
  status: string;
  /** The company's stated team size, if it gave one. */
  team_size: number | null;
  /** Team members it lists (public or not). */
  listed: number;
  availability: string | null;
};
export type OccupancyRequest = { space_id: string | null };

export type OfficeRow = OccupancyOffice & {
  company: OccupancyCompany | null;
  /** People: the stated team size, else the number of listed members. */
  people: number;
  /** Open requests naming this office. */
  requests: number;
};

export type FloorOccupancy = {
  floor: { id: string; slug: string; name: string; is_active: boolean };
  offices: OfficeRow[];
  occupied: number;
  vacant: number;
  /** 0–1, or null for a floor without offices. */
  rate: number | null;
  desks: number;
  people: number;
};

export function summarizeOccupancy(
  floors: Array<{ id: string; slug: string; name: string; is_active: boolean }>,
  offices: OccupancyOffice[],
  companies: OccupancyCompany[],
  requests: OccupancyRequest[],
): FloorOccupancy[] {
  const bySpace = new Map(companies.filter((c) => c.space_id).map((c) => [c.space_id!, c]));
  const requested = new Map<string, number>();
  for (const r of requests) if (r.space_id) requested.set(r.space_id, (requested.get(r.space_id) ?? 0) + 1);

  return floors.map((floor) => {
    const rows: OfficeRow[] = offices
      .filter((o) => o.floor_id === floor.id)
      .map((o) => {
        const company = bySpace.get(o.id) ?? null;
        return {
          ...o,
          company,
          people: company ? (company.team_size ?? company.listed) : 0,
          requests: requested.get(o.id) ?? 0,
        };
      });
    const occupied = rows.filter((r) => r.company).length;
    return {
      floor,
      offices: rows,
      occupied,
      vacant: rows.length - occupied,
      rate: rows.length ? occupied / rows.length : null,
      desks: rows.reduce((n, r) => n + (r.capacity ?? 0), 0),
      people: rows.reduce((n, r) => n + r.people, 0),
    };
  });
}
