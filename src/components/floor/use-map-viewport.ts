"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Bounds } from "@/lib/floor/geometry";
import {
  clampViewport,
  fitContent,
  focusOn,
  lerpViewport,
  panBy,
  screenToFloor,
  unitsPerPixel,
  zoomAt,
  zoomCentre,
  zoomLevel,
  type Viewport,
  type ViewportLimits,
} from "@/lib/floor/viewport";

const DRAG_THRESHOLD_PX = 5;
const ANIMATION_MS = 280;

/**
 * Zoom and pan for an SVG floor map, built on the pure maths in
 * lib/floor/viewport.ts. Handles wheel zoom (anchored at the cursor), drag to
 * pan, two-finger pinch, double-click zoom and animated "fly to" transitions.
 *
 * `consumeDrag()` tells click handlers whether the pointer gesture that just
 * ended was a drag, so panning never selects an office by accident.
 */
export function useMapViewport(content: Bounds, { maxZoom = 4, padding = 40 } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => ({
    x: content.x - padding,
    y: content.y - padding,
    width: content.width + padding * 2,
    height: content.height + padding * 2,
  }));

  const limits = useMemo<ViewportLimits | null>(
    () => (aspect ? { content, aspect, maxZoom, padding } : null),
    [aspect, content, maxZoom, padding],
  );
  const limitsRef = useRef(limits);
  const viewportRef = useRef(viewport);
  useEffect(() => {
    limitsRef.current = limits;
    viewportRef.current = viewport;
  });

  const animation = useRef<number | null>(null);
  const stopAnimation = () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  };

  const apply = useCallback((next: Viewport) => {
    stopAnimation();
    viewportRef.current = next;
    setViewport(next);
  }, []);

  const animateTo = useCallback(
    (target: Viewport) => {
      stopAnimation();
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const from = viewportRef.current;
      if (reduce) return apply(target);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ANIMATION_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = lerpViewport(from, target, eased);
        viewportRef.current = next;
        setViewport(next);
        animation.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animation.current = requestAnimationFrame(step);
    },
    [apply],
  );

  // Track the container's aspect ratio; refit on first measurement and keep the
  // current centre/zoom when the container is resized afterwards.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitted = useRef(false);
  useEffect(() => {
    if (!limits) return;
    if (!fitted.current) {
      fitted.current = true;
      apply(fitContent(limits));
    } else {
      apply(clampViewport(viewportRef.current, limits));
    }
  }, [limits, apply]);

  // --- Gestures --------------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinchDistance?: number }>({
    startX: 0,
    startY: 0,
    moved: false,
  });
  const dragged = useRef(false);

  const consumeDrag = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: event.clientX, startY: event.clientY, moved: false };
      dragged.current = false;
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function distance() {
      const [a, b] = [...pointers.current.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onMove(event: PointerEvent) {
      const prev = pointers.current.get(event.pointerId);
      const lim = limitsRef.current;
      if (!prev || !lim || !svg) return;
      const rect = svg.getBoundingClientRect();
      const vp = viewportRef.current;

      if (pointers.current.size >= 2) {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const before = gesture.current.pinchDistance ?? distance();
        const after = distance();
        const [a, b] = [...pointers.current.values()];
        const mid = screenToFloor({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rect, vp);
        gesture.current = { ...gesture.current, moved: true, pinchDistance: after };
        dragged.current = true;
        if (before > 0) apply(zoomAt(vp, after / before, mid, lim));
        return;
      }

      const totalX = event.clientX - gesture.current.startX;
      const totalY = event.clientY - gesture.current.startY;
      if (!gesture.current.moved && Math.hypot(totalX, totalY) < DRAG_THRESHOLD_PX) return;
      if (!gesture.current.moved) {
        gesture.current.moved = true;
        dragged.current = true;
        svg.setPointerCapture?.(event.pointerId);
      }
      const scale = unitsPerPixel(rect, vp);
      apply(panBy(vp, -(event.clientX - prev.x) * scale, -(event.clientY - prev.y) * scale, lim));
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    function onUp(event: PointerEvent) {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) gesture.current.pinchDistance = undefined;
      if (pointers.current.size === 1) {
        const [p] = [...pointers.current.values()];
        gesture.current = { startX: p.x, startY: p.y, moved: true };
      }
    }

    function onWheel(event: WheelEvent) {
      const lim = limitsRef.current;
      if (!lim || !svg) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const focus = screenToFloor({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      apply(zoomAt(viewportRef.current, Math.exp(-delta * 0.0015), focus, lim));
    }

    function onDoubleClick(event: MouseEvent) {
      const lim = limitsRef.current;
      if (!lim || !svg) return;
      const rect = svg.getBoundingClientRect();
      const focus = screenToFloor({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const target = zoomAt(viewportRef.current, event.shiftKey ? 0.5 : 2, focus, lim);
      animateTo(target);
    }

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("pointerleave", onUp);
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("dblclick", onDoubleClick);
    return () => {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("pointerleave", onUp);
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("dblclick", onDoubleClick);
    };
  }, [apply, animateTo]);

  useEffect(() => stopAnimation, []);

  // --- Commands --------------------------------------------------------------------
  const zoomIn = useCallback(() => {
    if (limitsRef.current) animateTo(zoomCentre(viewportRef.current, 1.5, limitsRef.current));
  }, [animateTo]);
  const zoomOut = useCallback(() => {
    if (limitsRef.current) animateTo(zoomCentre(viewportRef.current, 1 / 1.5, limitsRef.current));
  }, [animateTo]);
  const reset = useCallback(() => {
    if (limitsRef.current) animateTo(fitContent(limitsRef.current));
  }, [animateTo]);
  const pan = useCallback(
    (dxFraction: number, dyFraction: number) => {
      const vp = viewportRef.current;
      if (limitsRef.current) {
        animateTo(panBy(vp, vp.width * dxFraction, vp.height * dyFraction, limitsRef.current));
      }
    },
    [animateTo],
  );
  /** Fly to a space, zooming in. */
  const focus = useCallback(
    (bounds: Bounds, { animate = true } = {}) => {
      if (!limitsRef.current) return;
      const target = focusOn(bounds, limitsRef.current);
      if (animate) animateTo(target);
      else apply(target);
    },
    [animateTo, apply],
  );
  /** Pan just enough (at the current zoom) to bring a space fully into view. */
  const reveal = useCallback(
    (bounds: Bounds) => {
      const vp = viewportRef.current;
      const inside =
        bounds.x >= vp.x &&
        bounds.y >= vp.y &&
        bounds.x + bounds.width <= vp.x + vp.width &&
        bounds.y + bounds.height <= vp.y + vp.height;
      if (inside || !limitsRef.current) return;
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      animateTo(clampViewport({ ...vp, x: cx - vp.width / 2, y: cy - vp.height / 2 }, limitsRef.current));
    },
    [animateTo],
  );

  return {
    containerRef,
    svgRef,
    viewport,
    ready: limits !== null,
    zoom: limits ? zoomLevel(viewport, limits) : 1,
    maxZoom,
    onPointerDown,
    consumeDrag,
    zoomIn,
    zoomOut,
    reset,
    pan,
    focus,
    reveal,
  };
}
