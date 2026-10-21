import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildingPanel } from "@/components/floor/building-panel";

const building = {
  name: "Incubation Centre",
  timezone: "Asia/Kolkata",
  address: "Tech Hub, Block 4",
};

const floors = [
  {
    id: "f1",
    slug: "floor-1",
    name: "Floor 1",
    level: 1,
    tagline: "Deep tech & AI",
    description: "Ventures and collaboration zones.",
  },
  {
    id: "f2",
    slug: "floor-2",
    name: "Floor 2",
    level: 2,
    tagline: "BioTech & CleanTech Labs",
    description: "Wet labs and advanced research.",
  },
];

describe("BuildingPanel", () => {
  it("renders building info, address and timezone when open", () => {
    const html = renderToStaticMarkup(
      <BuildingPanel
        building={building}
        floors={floors}
        currentFloorSlug="floor-1"
        isOpen={true}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("Incubation Centre");
    expect(html).toContain("Tech Hub, Block 4");
    expect(html).toContain("Asia/Kolkata");
    expect(html).toContain("Floor 1");
    expect(html).toContain("Floor 2");
    expect(html).toContain("Deep tech &amp; AI");
    expect(html).toContain("BioTech &amp; CleanTech Labs");
    expect(html).toContain("Currently viewing");
    expect(html).toContain('href="/?floor=floor-2"');
  });

  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <BuildingPanel
        building={building}
        floors={floors}
        currentFloorSlug="floor-1"
        isOpen={false}
        onClose={() => {}}
      />,
    );

    expect(html).toBe("");
  });
});
