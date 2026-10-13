import type { Bounds } from "./geometry";

/**
 * Zoom and pan maths for the floor map.
 *
 * The map is an SVG whose `viewBox` is the "viewport": the rectangle of floor
 * coordinates currently visible. Zooming in makes the viewport smaller,
 * panning moves it. Keeping the viewport's aspect ratio equal to the
 * container's means one screen pixel maps to the same distance on both axes.
 *
 * These are pure functions so they can be unit tested without a browser.
 */
export type Viewport = Bounds;

export type ViewportLimits = {
  /** The whole drawing (layout width × height). */
  content: Bounds;
  /** Container width / height. */
  aspect: number;
  /** How far in the user may zoom, relative to "fit". */
  maxZoom: number;
  /** Extra space around the drawing when fitted, in floor units. */
  padding: number;
};

/** Smallest viewport containing `bounds` (plus padding) at the given aspect ratio, centred. */
export function fitBounds(bounds: Bounds, aspect: number, padding = 0): Viewport {
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const fitted =
    width / height > aspect ? { width, height: width / aspect } : { width: height * aspect, height };
  return {
    x: bounds.x + bounds.width / 2 - fitted.width / 2,
    y: bounds.y + bounds.height / 2 - fitted.height / 2,
    ...fitted,
  };
}

/** The "whole floor" viewport. */
export function fitContent(limits: ViewportLimits): Viewport {
  return fitBounds(limits.content, limits.aspect, limits.padding);
}

/** Current zoom relative to "fit" (1 = whole floor visible). */
export function zoomLevel(viewport: Viewport, limits: ViewportLimits) {
  return fitContent(limits).width / viewport.width;
}

/**
 * Keeps the viewport within zoom limits, at the container's aspect ratio, and
 * stops it drifting away from the drawing: the viewport centre must stay
 * inside the content (or exactly centred when fully zoomed out).
 */
export function clampViewport(viewport: Viewport, limits: ViewportLimits): Viewport {
  const fit = fitContent(limits);
  const minWidth = fit.width / limits.maxZoom;
  const width = Math.min(fit.width, Math.max(minWidth, viewport.width));
  const height = width / limits.aspect;

  const centre = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  const { content } = limits;
  // Allowed centre range shrinks to the content centre as we zoom out.
  const slackX = Math.max(0, (content.width - (width - limits.padding * 2)) / 2);
  const slackY = Math.max(0, (content.height - (height - limits.padding * 2)) / 2);
  const midX = content.x + content.width / 2;
  const midY = content.y + content.height / 2;
  const cx = Math.min(midX + slackX, Math.max(midX - slackX, centre.x));
  const cy = Math.min(midY + slackY, Math.max(midY - slackY, centre.y));

  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * Zooms by `factor` (>1 zooms in) keeping `focus` (floor coordinates) at the
 * same place on screen — e.g. the point under the mouse cursor.
 */
export function zoomAt(
  viewport: Viewport,
  factor: number,
  focus: { x: number; y: number },
  limits: ViewportLimits,
): Viewport {
  const width = viewport.width / factor;
  const height = viewport.height / factor;
  const next = {
    x: focus.x - (focus.x - viewport.x) * (width / viewport.width),
    y: focus.y - (focus.y - viewport.y) * (height / viewport.height),
    width,
    height,
  };
  return clampViewport(next, limits);
}

/** Zoom around the viewport centre (zoom buttons, keyboard). */
export function zoomCentre(viewport: Viewport, factor: number, limits: ViewportLimits): Viewport {
  return zoomAt(
    viewport,
    factor,
    { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 },
    limits,
  );
}

/** Moves the viewport by a distance in floor units. */
export function panBy(viewport: Viewport, dx: number, dy: number, limits: ViewportLimits): Viewport {
  return clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }, limits);
}

/**
 * Centres on `target` (e.g. a selected office), zooming in so the target fills
 * a comfortable share of the view without going past `maxZoom`.
 */
export function focusOn(target: Bounds, limits: ViewportLimits, fill = 0.4): Viewport {
  const wanted = fitBounds(
    {
      x: target.x - (target.width * (1 / fill - 1)) / 2,
      y: target.y - (target.height * (1 / fill - 1)) / 2,
      width: target.width / fill,
      height: target.height / fill,
    },
    limits.aspect,
  );
  return clampViewport(wanted, limits);
}

/** Converts a pointer position (client pixels) to floor coordinates. */
export function screenToFloor(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  viewport: Viewport,
) {
  return {
    x: viewport.x + ((point.x - rect.left) / rect.width) * viewport.width,
    y: viewport.y + ((point.y - rect.top) / rect.height) * viewport.height,
  };
}

/** Floor units per screen pixel. */
export function unitsPerPixel(rect: { width: number }, viewport: Viewport) {
  return viewport.width / rect.width;
}

/** Linear interpolation between two viewports (for animated transitions). */
export function lerpViewport(from: Viewport, to: Viewport, t: number): Viewport {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
  };
}
