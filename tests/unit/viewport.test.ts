import { describe, expect, it } from "vitest";
import { fitLabel, labelFontSize } from "@/lib/floor/geometry";
import {
  clampViewport,
  fitBounds,
  fitContent,
  focusOn,
  panBy,
  screenToFloor,
  zoomAt,
  zoomCentre,
  zoomLevel,
  type ViewportLimits,
} from "@/lib/floor/viewport";

const limits: ViewportLimits = {
  content: { x: 0, y: 0, width: 1200, height: 800 },
  aspect: 1.5,
  maxZoom: 4,
  padding: 0,
};

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("fitBounds", () => {
  it("matches the container aspect and centres the content", () => {
    // Content 1200×800 in a square container: width-limited.
    expect(fitBounds({ x: 0, y: 0, width: 1200, height: 800 }, 1)).toEqual({
      x: 0,
      y: -200,
      width: 1200,
      height: 1200,
    });
    // In a very wide container: height-limited.
    expect(fitBounds({ x: 0, y: 0, width: 1200, height: 800 }, 3)).toEqual({
      x: -600,
      y: 0,
      width: 2400,
      height: 800,
    });
  });

  it("adds padding on every side", () => {
    const vp = fitBounds({ x: 0, y: 0, width: 100, height: 100 }, 1, 10);
    expect(vp).toEqual({ x: -10, y: -10, width: 120, height: 120 });
  });
});

describe("zoom", () => {
  const fit = fitContent(limits);

  it("starts at zoom level 1", () => {
    expect(zoomLevel(fit, limits)).toBe(1);
  });

  it("keeps the focus point fixed on screen", () => {
    const focus = { x: 300, y: 200 };
    const next = zoomAt(fit, 2, focus, limits);
    // Relative position of the focus point inside the viewport is unchanged.
    close((focus.x - next.x) / next.width, (focus.x - fit.x) / fit.width);
    close((focus.y - next.y) / next.height, (focus.y - fit.y) / fit.height);
    expect(zoomLevel(next, limits)).toBeCloseTo(2);
  });

  it("never zooms out past fit or in past maxZoom", () => {
    expect(zoomCentre(fit, 0.25, limits)).toEqual(fit);
    let vp = fit;
    for (let i = 0; i < 10; i++) vp = zoomCentre(vp, 2, limits);
    expect(zoomLevel(vp, limits)).toBeCloseTo(4);
  });
});

describe("pan and clamp", () => {
  it("cannot pan when fully zoomed out", () => {
    const fit = fitContent(limits);
    expect(panBy(fit, 500, 500, limits)).toEqual(fit);
  });

  it("keeps the viewport centre inside the drawing when zoomed in", () => {
    const zoomed = zoomCentre(fitContent(limits), 4, limits);
    const far = panBy(zoomed, 10_000, -10_000, limits);
    const cx = far.x + far.width / 2;
    const cy = far.y + far.height / 2;
    expect(cx).toBeLessThanOrEqual(1200);
    expect(cy).toBeGreaterThanOrEqual(0);
    // ...and no further than needed to show the edge of the drawing.
    close(far.x + far.width, 1200);
    close(far.y, 0);
  });

  it("restores the container aspect ratio", () => {
    const vp = clampViewport({ x: 0, y: 0, width: 600, height: 100 }, limits);
    close(vp.width / vp.height, 1.5);
  });
});

describe("focusOn", () => {
  it("centres the target and makes it fill part of the view", () => {
    const office = { x: 40, y: 40, width: 360, height: 280 };
    const vp = focusOn(office, limits);
    expect(vp.width).toBeGreaterThan(office.width);
    expect(vp.width).toBeLessThan(1200);
    // Clamped against the top-left edge, so the office is fully visible.
    expect(vp.x).toBeLessThanOrEqual(office.x);
    expect(vp.y).toBeLessThanOrEqual(office.y);
    expect(vp.x + vp.width).toBeGreaterThanOrEqual(office.x + office.width);
    expect(vp.y + vp.height).toBeGreaterThanOrEqual(office.y + office.height);
  });
});

describe("screenToFloor", () => {
  it("maps pixels to floor coordinates", () => {
    const rect = { left: 100, top: 50, width: 600, height: 400 };
    const vp = { x: 0, y: 0, width: 1200, height: 800 };
    expect(screenToFloor({ x: 100, y: 50 }, rect, vp)).toEqual({ x: 0, y: 0 });
    expect(screenToFloor({ x: 400, y: 250 }, rect, vp)).toEqual({ x: 600, y: 400 });
  });
});

describe("labels", () => {
  it("truncates long names with an ellipsis", () => {
    expect(fitLabel("Acme", 200, 20)).toBe("Acme");
    const label = fitLabel("Extremely Long Company Name Private Limited", 200, 20);
    expect(label.endsWith("…")).toBe(true);
    expect(label.length).toBeLessThanOrEqual(Math.floor(200 / (20 * 0.56)));
  });

  it("scales font size with the space within limits", () => {
    expect(labelFontSize({ x: 0, y: 0, width: 360, height: 280 })).toBe(26);
    expect(labelFontSize({ x: 0, y: 0, width: 60, height: 60 })).toBe(12);
  });
});
