import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildingPanel } from "@/components/floor/building-panel";
import { stageLabel, teamSizeLabel } from "@/lib/companies/startup";
import { matchCompany } from "@/lib/floor/search";
import { demoFloorPlan } from "@/lib/floor/samples/demo-floor";
import { companyProfileSchema } from "@/lib/validation/company";
import { announcementSchema, staffMemberSchema } from "@/lib/validation/incubator";

const profile = {
  name: "Acme Robotics",
  industry: "deep-tech-hardware",
  description: "We build warehouse robots for small businesses.",
  services: "",
  businessEmail: "hello@acme.dev",
};

describe("startup profile form", () => {
  it("accepts stage, team size and a comma-separated tech stack", () => {
    const parsed = companyProfileSchema.parse({
      ...profile,
      stage: "early_revenue",
      teamSize: "12",
      techStack: "Python, ROS,  python ,\nReact",
    });
    expect(parsed.stage).toBe("early_revenue");
    expect(parsed.teamSize).toBe("12");
    // Trimmed and de-duplicated (exact duplicates only; case is kept as typed).
    expect(parsed.techStack).toEqual(["Python", "ROS", "python", "React"]);
  });

  it("treats the new fields as optional", () => {
    const parsed = companyProfileSchema.parse({ ...profile, stage: "", teamSize: "", techStack: "" });
    expect(parsed.stage).toBeUndefined();
    expect(parsed.teamSize).toBeUndefined();
    expect(parsed.techStack).toEqual([]);
  });

  it.each([
    ["an unknown stage", { stage: "unicorn" }],
    ["a team of zero", { teamSize: "0" }],
    ["a team size that isn't a number", { teamSize: "ten" }],
    ["21 technologies", { techStack: Array.from({ length: 21 }, (_, i) => `t${i}`).join(",") }],
    ["a technology over 40 characters", { techStack: "x".repeat(41) }],
  ])("rejects %s", (_label, extra) => {
    expect(companyProfileSchema.safeParse({ ...profile, ...extra }).success).toBe(false);
  });

  it("labels stages and team sizes for display", () => {
    expect(stageLabel("mvp")).toBe("MVP");
    expect(stageLabel(null)).toBeNull();
    expect(teamSizeLabel(1)).toBe("1 person");
    expect(teamSizeLabel(9)).toBe("9 people");
  });
});

describe("floor search over the startup profile", () => {
  const robotics = demoFloorPlan.companies.find((c) => c.name === "Sample Robotics")!;

  it("finds a company by technology, saying why, and by stage", () => {
    expect(matchCompany(robotics, undefined, "ros")).toEqual({ reason: "Tech: ROS" });
    expect(matchCompany(robotics, undefined, "mvp")).toEqual({ reason: null });
    expect(matchCompany(robotics, undefined, "growth")).toBeNull();
  });
});

describe("admin forms", () => {
  it("validates FITT team members", () => {
    expect(
      staffMemberSchema.parse({
        fullName: " Priya Nair ",
        availability: "busy",
        isPublic: "on",
        sortOrder: "2",
      }),
    ).toMatchObject({ fullName: "Priya Nair", availability: "busy", isPublic: true, sortOrder: "2" });
    expect(staffMemberSchema.parse({ fullName: "A", availability: "unknown" }).isPublic).toBe(false);
    expect(staffMemberSchema.safeParse({ fullName: "", availability: "busy" }).success).toBe(false);
    expect(staffMemberSchema.safeParse({ fullName: "A", availability: "busy", email: "nope" }).success).toBe(
      false,
    );
  });

  it("splits announcement times into the building's wall date and time", () => {
    const parsed = announcementSchema.parse({
      title: "Demo day",
      floorId: "all",
      startsAt: "",
      endsAt: "2026-10-24T18:30",
    });
    expect(parsed.startsAt).toBeUndefined();
    expect(parsed.endsAt).toEqual({ date: "2026-10-24", time: "18:30" });
    expect(announcementSchema.safeParse({ title: "x", floorId: "all", endsAt: "tomorrow" }).success).toBe(
      false,
    );
    expect(announcementSchema.safeParse({ title: "", floorId: "all" }).success).toBe(false);
  });
});

describe("building overview", () => {
  it("lists running announcements with their floor, and the FITT team with contacts", () => {
    const html = renderToStaticMarkup(
      <BuildingPanel
        building={demoFloorPlan.building}
        floors={demoFloorPlan.floors}
        currentFloorSlug="demo"
        staff={demoFloorPlan.staff}
        announcements={[
          ...demoFloorPlan.announcements,
          {
            id: "an2",
            floor_id: "demo-floor",
            title: "Lab closed",
            body: null,
            starts_at: "",
            ends_at: null,
          },
        ]}
        isOpen
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Demo day on Friday");
    expect(html).toContain("All floors");
    expect(html).toMatch(/Lab closed[\s\S]*Sample floor/);
    expect(html).toContain("FITT Incubation Team");
    expect(html).toContain('href="mailto:programmes@example.dev"');
    expect(html).toContain("Facilities &amp; front desk");
  });
});
