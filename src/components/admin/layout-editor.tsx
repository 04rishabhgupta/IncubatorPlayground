"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FloorMap } from "@/components/floor/floor-map";
import { MapControls } from "@/components/floor/map-controls";
import { useMapViewport } from "@/components/floor/use-map-viewport";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveFloorLayout, type SaveLayoutState } from "@/lib/admin/layout-actions";
import { cn } from "@/lib/cn";
import type { LayoutEditorData, LayoutVersion } from "@/lib/floor/editor-queries";
import { formatDate } from "@/lib/format";
import {
  formatDocument,
  validateLayoutDocument,
  type LayoutDocument,
  type ValidationResult,
} from "@/lib/floor/layout-document";

const initialState: SaveLayoutState = { status: "idle" };

/**
 * The floor layout editor: the whole floor as JSON on the left, a live
 * preview with the floor's real companies on the right, problems underneath
 * and the saved versions below. Nothing reaches visitors until "Save".
 */
export function LayoutEditor({ data }: { data: LayoutEditorData }) {
  const codes = useMemo(() => data.spaces.map((s) => s.code), [data.spaces]);
  const [saved, setSaved] = useState(data.text);
  const [text, setText] = useState(data.text);
  const [result, setResult] = useState<ValidationResult>(() => validateLayoutDocument(data.text, codes));
  const [lastValid, setLastValid] = useState<LayoutDocument | null>(result.document);
  const [state, action] = useActionState(saveFloorLayout, initialState);
  const [expected, setExpected] = useState(data.updatedAt);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;

  // Validate (and refresh the preview) shortly after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = validateLayoutDocument(text, codes);
      setResult(next);
      if (next.document) setLastValid(next.document);
    }, 250);
    return () => clearTimeout(timer);
  }, [text, codes]);

  // After a successful save this text is the new baseline, and the next save is checked against the new stamp.
  const [handled, setHandled] = useState<SaveLayoutState | null>(null);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") {
      setSaved(text);
      if (state.updatedAt) setExpected(state.updatedAt);
    }
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function load(next: string, what: string) {
    if (dirty && !window.confirm(`Replace your unsaved changes with ${what}?`)) return;
    setText(next);
  }

  function format() {
    try {
      setText(formatDocument(JSON.parse(text)));
    } catch {
      // Leave invalid JSON as typed; the problems list says where it breaks.
    }
  }

  // Tab indents instead of leaving the editor.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${text.slice(0, start)}  ${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  }

  /** Put the caret on "line 3, column 13" in the editor. */
  function jumpTo(path: string) {
    const m = /^line (\d+), column (\d+)$/.exec(path);
    const el = textRef.current;
    if (!m || !el) return;
    const lines = text.split("\n");
    const offset = lines.slice(0, Number(m[1]) - 1).reduce((n, l) => n + l.length + 1, 0) + Number(m[2]) - 1;
    el.focus();
    el.setSelectionRange(offset, offset + 1);
  }

  const canSave = dirty && result.errors.length === 0 && result.document !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <nav aria-label="Floors">
          <ul className="flex flex-wrap items-center gap-1.5">
            {data.floors.map((f) => (
              <li key={f.slug}>
                <Link
                  href={`/admin/floor/editor?floor=${f.slug}`}
                  aria-current={f.slug === data.floor.slug ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium",
                    f.slug === data.floor.slug
                      ? "bg-brand-600 text-white"
                      : "border border-border text-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={format}>
            Format JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => load(saved, "the saved layout")} disabled={!dirty}>
            Discard changes
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="layout-json"
            className="flex items-center justify-between text-sm font-medium text-ink"
          >
            <span>Layout JSON · {data.floor.name}</span>
            <span className="text-xs font-normal text-muted">
              {dirty ? "Unsaved changes" : "Saved"} · 40 units = 1 m
            </span>
          </label>
          <textarea
            id="layout-json"
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-describedby="layout-problems"
            aria-invalid={result.errors.length > 0}
            className="h-[60vh] min-h-[360px] w-full resize-y rounded-xl border border-border bg-surface p-3 font-mono text-xs leading-5 text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="space-y-2">
          <p className="flex items-center justify-between text-sm font-medium text-ink">
            <span>Preview</span>
            {!result.document && lastValid && (
              <span className="text-xs font-normal text-amber-700">Showing the last valid version</span>
            )}
          </p>
          {lastValid ? (
            <Preview data={data} doc={lastValid} />
          ) : (
            <div className="flex h-[60vh] min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
              Nothing to preview until the JSON is valid.
            </div>
          )}
        </div>
      </div>

      <Problems result={result} onJump={jumpTo} />

      <form action={action} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <input type="hidden" name="floorId" value={data.floor.id} />
        <input type="hidden" name="document" value={text} />
        <input type="hidden" name="expectedUpdatedAt" value={expected} />
        {state.message && (
          <Alert tone={state.status === "success" ? "success" : "error"}>
            {state.message}
            {state.errors && state.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {state.errors.map((e, i) => (
                  <li key={i}>
                    {e.path}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 space-y-1 text-sm">
            <span className="font-medium text-ink">What changed?</span>{" "}
            <span className="text-muted">(optional, shown in the history)</span>
            <input
              name="note"
              maxLength={200}
              placeholder="e.g. Moved the pantry counter"
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <SubmitButton pendingLabel="Saving…" disabled={!canSave}>
            Save layout
          </SubmitButton>
        </div>
        <p className="text-xs text-muted">
          {result.errors.length
            ? "Fix the errors above to save."
            : dirty
              ? "Saving updates the public floor map straight away. Office ids, placements and appointments are kept."
              : "No changes to save."}
        </p>
      </form>

      <History versions={data.versions} current={saved} onLoad={(v) => load(v.text, "this version")} />
    </div>
  );
}

function Preview({ data, doc }: { data: LayoutEditorData; doc: LayoutDocument }) {
  const content = useMemo(
    () => ({ x: 0, y: 0, width: doc.width, height: doc.height }),
    [doc.width, doc.height],
  );
  const {
    containerRef,
    svgRef,
    viewport,
    ready,
    zoom,
    pixelsPerUnit,
    maxZoom,
    onPointerDown,
    zoomIn,
    zoomOut,
    reset,
  } = useMapViewport(content);
  const plan = useMemo(
    () => ({
      floor: { ...data.floor, level: 0, tagline: null, description: null },
      layout: { width: doc.width, height: doc.height, geometry: doc.geometry },
      spaces: data.spaces.map((s) => ({ ...s, shape: doc.spaces[s.code] })),
    }),
    [data.floor, data.spaces, doc],
  );
  const companiesBySpace = useMemo(
    () => new Map(data.companies.filter((c) => c.space_id).map((c) => [c.space_id!, c])),
    [data.companies],
  );
  return (
    <div
      ref={containerRef}
      className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-xl border border-border bg-surface"
    >
      <FloorMap
        ref={svgRef}
        plan={plan}
        companiesBySpace={companiesBySpace}
        viewport={viewport}
        pixelsPerUnit={pixelsPerUnit}
        onPointerDown={onPointerDown}
        className={ready ? "opacity-100" : "opacity-0"}
      />
      <MapControls
        className="absolute right-3 top-3"
        zoom={zoom}
        maxZoom={maxZoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={reset}
      />
    </div>
  );
}

function Problems({ result, onJump }: { result: ValidationResult; onJump: (path: string) => void }) {
  const { errors, warnings } = result;
  return (
    <section id="layout-problems" aria-live="polite" className="space-y-2">
      {errors.length === 0 && warnings.length === 0 ? (
        <p className="text-sm text-green-800">No problems found.</p>
      ) : (
        <>
          {[
            ["Errors", errors, "text-red-800"],
            ["Warnings", warnings, "text-amber-800"],
          ].map(([title, list, tone]) =>
            (list as typeof errors).length ? (
              <div key={title as string}>
                <h3 className={cn("text-sm font-semibold", tone as string)}>
                  {title as string} ({(list as typeof errors).length})
                </h3>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {(list as typeof errors).map((p, i) => (
                    <li key={i} className="font-mono text-xs">
                      {/^line \d+/.test(p.path) ? (
                        <button
                          type="button"
                          onClick={() => onJump(p.path)}
                          className="text-brand-700 hover:underline"
                        >
                          {p.path}
                        </button>
                      ) : (
                        <span className="text-muted">{p.path}</span>
                      )}
                      <span className="font-sans text-ink"> — {p.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </>
      )}
    </section>
  );
}

function History({
  versions,
  current,
  onLoad,
}: {
  versions: LayoutVersion[];
  current: string;
  onLoad: (version: LayoutVersion) => void;
}) {
  return (
    <section aria-labelledby="layout-history" className="rounded-xl border border-border bg-surface p-4">
      <h2 id="layout-history" className="font-semibold text-ink">
        History
      </h2>
      {versions.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          No saved versions yet. The first save also keeps the layout as it is now, so it can be restored.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {versions.map((v) => {
            const isCurrent = v.text === current;
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">
                    {v.note ?? "No note"}
                    {isCurrent && (
                      <span className="ml-2 rounded bg-brand-50 px-1.5 text-xs text-brand-800">Current</span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {formatDate(v.created_at, "datetime")}
                    {v.author ? ` · ${v.author}` : ""}
                  </span>
                </span>
                {!isCurrent && (
                  <Button variant="secondary" size="sm" onClick={() => onLoad(v)}>
                    Load into editor
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted">
        Loading a version only fills the editor. Check the preview, then save to restore it.
      </p>
    </section>
  );
}
