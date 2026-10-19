import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloorMap } from "@/components/floor/floor-map";
import { floorGeometrySchema } from "@/lib/floor/geometry";
import type { FloorPlan, MapCompany } from "@/lib/floor/queries";
import { demoFloorPlan } from "@/lib/floor/samples/demo-floor";

const viewport = { x: 0, y: 0, width: 1200, height: 800 };
const bySpace = (plan: FloorPlan) =>
  new Map<string, MapCompany>(plan.companies.filter((c) => c.space_id).map((c) => [c.space_id!, c]));

function render(plan: FloorPlan, interactive = true, pixelsPerUnit?: number) {
  const html = renderToStaticMarkup(
    <FloorMap
      plan={plan}
      companiesBySpace={bySpace(plan)}
      viewport={viewport}
      pixelsPerUnit={pixelsPerUnit}
      selectedSpaceId="s101"
      onSelect={interactive ? () => {} : undefined}
    />,
  );
  // Parse just enough of the markup for assertions.
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  return { html, count };
}

describe("FloorMap renderer", () => {
  it("draws layers in order: base, rooms, details, seats, area labels, spaces", () => {
    const { html } = render(demoFloorPlan);
    const order = ["base", "rooms", "details", "seats", "area-labels", "spaces"].map((l) =>
      html.indexOf(`data-layer="${l}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("draws every fixture at its own size, without stretched symbols", () => {
    const { count } = render(demoFloorPlan);
    expect(count(/data-fixture="/g)).toBe(demoFloorPlan.layout.geometry.fixtures.length);
    expect(count(/<use /g)).toBe(0);
    expect(count(/<symbol /g)).toBe(0);
  });

  it("cuts doors, windows and entrances out of the walls with a mask", () => {
    const { html, count } = render(demoFloorPlan);
    const g = demoFloorPlan.layout.geometry;
    expect(html).toMatch(/data-layer="walls" mask="url\(#[^)]+-openings\)"/);
    expect(count(/fill="black"/g)).toBe(g.doors.length + g.windows.length + g.entrances.length);
  });

  it("sizes labels for the zoom and sets the detail level", () => {
    const far = render(demoFloorPlan, true, 0.5);
    const near = render(demoFloorPlan, true, 3);
    expect(far.html).toContain('data-lod="0"');
    expect(near.html).toContain('data-lod="2"');
    // Zoomed out: one compact line per office; close up: code, name, industry and status.
    expect(far.html).toContain(">Sample Robotics<");
    expect(far.html).not.toContain(">Deep Tech &amp; Hardware<");
    expect(near.html).toContain(">Deep Tech &amp; Hardware<");
    // Text keeps its screen size: 15 px at 3 px per unit is 5 floor units.
    expect(near.html).toMatch(/font-size="5"[^>]*>Sample Robotics</);
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

  it("seats the public team in order, with more detail closer in", () => {
    const team = demoFloorPlan.companies.find((c) => c.name === "Sample Robotics")!.team;
    expect(team.length).toBeGreaterThan(0);
    // Overview: no seats; floor view: a status dot per member; close up: initials.
    expect(render(demoFloorPlan, true, 0.5).count(/data-seat="/g)).toBe(0);
    expect(render(demoFloorPlan, true, 1).count(/data-seat="/g)).toBe(team.length);
    const near = render(demoFloorPlan, true, 3);
    expect(near.count(/data-seat="/g)).toBe(team.length);
    expect(near.html).toMatch(/data-seat="1"[\s\S]*?>AR</);
  });

  it("shows availability as a status chip on the room label", () => {
    const { html } = render(demoFloorPlan);
    expect(html).toContain('data-status-chip="available"');
    expect(html).toContain('data-status-chip="busy"');
  });

  it("makes shared areas (not corridors) buttons when areas are selectable", () => {
    const html = renderToStaticMarkup(
      <FloorMap
        plan={demoFloorPlan}
        companiesBySpace={bySpace(demoFloorPlan)}
        viewport={viewport}
        onSelect={() => {}}
        onSelectArea={() => {}}
        selectedAreaKey="lounge"
      />,
    );
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    expect(count(/role="button"/g)).toBe(demoFloorPlan.spaces.length + 2);
    expect(html).toMatch(
      /data-area-key="lounge"[^>]*data-selected="true"[^>]*aria-label="Lounge, shared space, Sofa, Wi-Fi"/,
    );
    expect(html).toContain('data-area-key="pantry"');
    expect(html).not.toContain('data-area-key="corridor"');
    // Every button can be reached by keyboard room navigation.
    expect(count(/data-nav-id="/g)).toBe(demoFloorPlan.spaces.length + 2);
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
    expect(count(/data-fixture="/g)).toBe(0);
    expect(html).not.toMatch(/data-layer="fixtures"[^>]*filter=/);
    expect(count(/role="button"/g)).toBe(demoFloorPlan.spaces.length);
  });

  it("gives each map its own mask ids so two maps can share a page", () => {
    const html = renderToStaticMarkup(
      <>
        <FloorMap plan={demoFloorPlan} companiesBySpace={bySpace(demoFloorPlan)} viewport={viewport} />
        <FloorMap plan={demoFloorPlan} companiesBySpace={bySpace(demoFloorPlan)} viewport={viewport} />
      </>,
    );
    const ids = [...html.matchAll(/<mask id="([^"]+)-openings"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
