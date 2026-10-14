import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloorMap } from "@/components/floor/floor-map";
import { FIXTURE_SYMBOLS } from "@/components/floor/floor-symbols";
import { floorGeometrySchema } from "@/lib/floor/geometry";
import type { FloorPlan, MapCompany } from "@/lib/floor/queries";
import { demoFloorPlan } from "@/lib/floor/samples/demo-floor";

const viewport = { x: 0, y: 0, width: 1200, height: 800 };
const bySpace = (plan: FloorPlan) =>
  new Map<string, MapCompany>(plan.companies.filter((c) => c.space_id).map((c) => [c.space_id!, c]));

function render(plan: FloorPlan, interactive = true) {
  const html = renderToStaticMarkup(
    <FloorMap
      plan={plan}
      companiesBySpace={bySpace(plan)}
      viewport={viewport}
      selectedSpaceId="s101"
      onSelect={interactive ? () => {} : undefined}
    />,
  );
  // Parse just enough of the markup for assertions.
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  return { html, count };
}

describe("FloorMap renderer", () => {
  it("draws layers in order: base, rooms, details, area labels, spaces", () => {
    const { html } = render(demoFloorPlan);
    const order = ["base", "rooms", "details", "area-labels", "spaces"].map((l) =>
      html.indexOf(`data-layer="${l}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("stamps one <use> per fixture and defines every symbol once", () => {
    const { count } = render(demoFloorPlan);
    expect(count(/<use /g)).toBe(demoFloorPlan.layout.geometry.fixtures.length);
    expect(count(/<symbol /g)).toBe(Object.keys(FIXTURE_SYMBOLS).length);
  });

  it("draws doors, windows and walls of each kind", () => {
    const { count } = render(demoFloorPlan);
    const g = demoFloorPlan.layout.geometry;
    expect(count(/data-door="/g)).toBe(g.doors.length);
    expect(count(/data-window=""/g)).toBe(g.windows.length);
    expect(count(/data-wall="exterior"/g)).toBe(1);
    expect(count(/data-wall="interior"/g)).toBe(g.walls.filter((w) => w.kind === "interior").length);
    expect(count(/data-wall="glass"/g)).toBe(1);
  });

  it("keeps every space an accessible button above the decoration", () => {
    const { html, count } = render(demoFloorPlan);
    expect(count(/role="button"/g)).toBe(demoFloorPlan.spaces.length);
    expect(html).toContain('aria-label="Office 101, Sample Robotics, Deep Tech &amp; Hardware, Available"');
    expect(html).toMatch(/data-space-code="101"[^>]*data-selected="true"/);
    // Decorative layers are hidden from assistive technology.
    expect(html).toMatch(/aria-hidden="true" class="pointer-events-none" data-layer="details"/);
  });

  it("renders spaces without buttons when not interactive", () => {
    const { count } = render(demoFloorPlan, false);
    expect(count(/role="button"/g)).toBe(0);
  });

  it("draws today's furniture-free layout without fixtures or a shadow filter", () => {
    const plain: FloorPlan = {
      ...demoFloorPlan,
      layout: {
        ...demoFloorPlan.layout,
        geometry: floorGeometrySchema.parse({
          walls: [
            {
              points: [
                [20, 20],
                [1180, 20],
                [1180, 780],
                [20, 780],
              ],
              closed: true,
            },
          ],
          areas: demoFloorPlan.layout.geometry.areas,
        }),
      },
    };
    const { html, count } = render(plain);
    expect(count(/<use /g)).toBe(0);
    expect(html).not.toMatch(/data-layer="fixtures"[^>]*filter=/);
    expect(count(/role="button"/g)).toBe(demoFloorPlan.spaces.length);
  });

  it("gives each map its own symbol ids so two maps can share a page", () => {
    const html = renderToStaticMarkup(
      <>
        <FloorMap plan={demoFloorPlan} companiesBySpace={bySpace(demoFloorPlan)} viewport={viewport} />
        <FloorMap plan={demoFloorPlan} companiesBySpace={bySpace(demoFloorPlan)} viewport={viewport} />
      </>,
    );
    const ids = [...html.matchAll(/<symbol id="([^"]+)-fx-desk"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
