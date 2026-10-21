"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type KeyboardEvent } from "react";
import { FloorMap } from "@/components/floor/floor-map";
import { MapControls, MapLegend } from "@/components/floor/map-controls";
import { useMapViewport } from "@/components/floor/use-map-viewport";
import { Alert } from "@/components/ui/alert";
import { InputField, SelectField } from "@/components/ui/field";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePlacement, updateSpaceDetails } from "@/lib/admin/floor-actions";
import { cn } from "@/lib/cn";
import type { AdminFloorData, PlacedCompany } from "@/lib/floor/admin-queries";
import type { MapSpace } from "@/lib/floor/queries";
import { initialFormState, type FormState } from "@/lib/forms";
import { FloorSettingsModal } from "./floor-settings";

const kindLabel: Record<MapSpace["kind"], string> = {
  office: "Office",
  meeting_room: "Meeting room",
  common_area: "Common area",
  reception: "Reception",
};

export function FloorPlacement({ data }: { data: AdminFloorData }) {
  const { plan, placed, unplaced } = data;
  const content = useMemo(
    () => ({ x: 0, y: 0, width: plan.layout.width, height: plan.layout.height }),
    [plan.layout.width, plan.layout.height],
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
    consumeDrag,
    zoomIn,
    zoomOut,
    reset,
    pan,
  } = useMapViewport(content);

  const companiesBySpace = useMemo(
    () => new Map(placed.filter((c) => c.space_id).map((c) => [c.space_id!, c as PlacedCompany])),
    [placed],
  );
  const vacantOffices = useMemo(
    () => plan.spaces.filter((s) => s.kind === "office" && !companiesBySpace.has(s.id)),
    [plan.spaces, companiesBySpace],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // The current floor with its visibility flag (plan.floor doesn't carry it).
  const currentFloor = data.allFloors.find((f) => f.id === plan.floor.id) ?? {
    ...plan.floor,
    is_active: true,
  };

  // One result for all placement forms, tied to the space being edited, so the
  // confirmation survives the panel switching between "vacant" and "occupied".
  const [placement, placementAction] = useActionState<PlacementState, FormData>(
    async (prev: PlacementState, formData: FormData): Promise<PlacementState> => ({
      ...(await updatePlacement(prev, formData)),
      panelSpaceId: String(formData.get("panelSpaceId") ?? ""),
    }),
    initialFormState,
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selected = plan.spaces.find((s) => s.id === selectedId) ?? null;
  const occupant = selected ? companiesBySpace.get(selected.id) : undefined;
  const placementState = selected && placement.panelSpaceId === selected.id ? placement : initialFormState;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const actions: Record<string, () => void> = {
      "+": zoomIn,
      "=": zoomIn,
      "-": zoomOut,
      "0": reset,
      ArrowLeft: () => pan(-0.2, 0),
      ArrowRight: () => pan(0.2, 0),
      ArrowUp: () => pan(0, -0.2),
      ArrowDown: () => pan(0, 0.2),
      Escape: () => setSelectedId(null),
    };
    if (actions[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      actions[event.key]();
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Floor:</span>
              {/* Links to other pages, so a navigation list (not ARIA tabs). */}
              <nav aria-label="Admin floors">
                <ul className="flex flex-wrap items-center gap-1.5">
                  {data.allFloors.map((f) => {
                    const isCurrent = f.id === plan.floor.id;
                    return (
                      <li key={f.id}>
                        <Link
                          href={`/admin/floor?floor=${f.slug}`}
                          aria-current={isCurrent ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                            isCurrent
                              ? "bg-brand-600 text-white"
                              : "border border-border bg-surface text-muted hover:bg-surface-muted hover:text-ink",
                          )}
                        >
                          <span>{f.name}</span>
                          {!f.is_active && (
                            <span
                              className={cn(
                                "rounded px-1 text-[10px]",
                                isCurrent
                                  ? "bg-white/20 text-white"
                                  : "bg-status-unavailable/15 text-status-unavailable",
                              )}
                            >
                              Hidden
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{plan.spaces.filter((s) => s.kind === "office").length} offices</span>
                <span>·</span>
                <span className="font-medium text-ink">{companiesBySpace.size} occupied</span>
                <span>·</span>
                <span>{vacantOffices.length} vacant</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="size-3.5 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Floor settings</span>
              </button>
            </div>
          </div>

          {!currentFloor.is_active && (
            <Alert tone="warning" title="Hidden from visitors">
              {currentFloor.name} is switched off, so it isn&apos;t on the public map. Turn it back on in
              Floor settings.
            </Alert>
          )}

          <div
            ref={containerRef}
            onKeyDown={handleKeyDown}
            className="relative aspect-[3/2] min-h-[300px] w-full overflow-hidden rounded-xl border border-border bg-surface"
          >
            <FloorMap
              ref={svgRef}
              plan={plan}
              companiesBySpace={companiesBySpace}
              viewport={viewport}
              pixelsPerUnit={pixelsPerUnit}
              selectedSpaceId={selectedId}
              hoveredSpaceId={hoveredId}
              onSelect={(space) => {
                if (!consumeDrag()) setSelectedId(space.id);
              }}
              onHover={(space) => setHoveredId(space?.id ?? null)}
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
            <MapLegend className="absolute bottom-3 left-3 hidden sm:flex" />
          </div>
          <p className="text-sm text-muted">
            {vacantOffices.length} vacant {vacantOffices.length === 1 ? "office" : "offices"} ·{" "}
            {unplaced.length} approved {unplaced.length === 1 ? "company" : "companies"} without an office
          </p>
        </div>

        <aside
          aria-label="Placement"
          className="space-y-4 self-start rounded-xl border border-border bg-surface p-5"
        >
          {!selected ? (
            <>
              <h2 className="font-semibold text-ink">Select a space</h2>
              <p className="text-sm text-muted">
                Click an office on the map to assign, move or remove a company, or to rename the space.
              </p>
              {unplaced.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-ink">Waiting for an office</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {unplaced.map((c) => (
                      <li key={c.id}>
                        {c.name}
                        {c.industry ? ` · ${c.industry.name}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div key={selected.id} className="space-y-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {kindLabel[selected.kind]}
                </p>
                <h2 className="text-lg font-semibold text-ink">{selected.label}</h2>
              </div>

              {selected.kind === "office" && (
                <>
                  <Message state={placementState} />
                  {occupant ? (
                    <OccupiedOffice
                      company={occupant}
                      panelSpaceId={selected.id}
                      vacantOffices={vacantOffices}
                      state={placementState}
                      action={placementAction}
                    />
                  ) : (
                    <AssignForm
                      spaceId={selected.id}
                      unplaced={unplaced}
                      state={placementState}
                      action={placementAction}
                    />
                  )}
                </>
              )}

              <SpaceDetailsForm space={selected} />
            </div>
          )}
        </aside>
      </div>

      {/* Mounted only while open, so each opening starts with a fresh form and no old result. */}
      {isSettingsOpen && (
        <FloorSettingsModal floor={currentFloor} isOpen onClose={() => setIsSettingsOpen(false)} />
      )}
    </>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

type PlacementState = FormState & { panelSpaceId?: string };
type PlacementFormProps = { state: PlacementState; action: (formData: FormData) => void };

function AssignForm({
  spaceId,
  unplaced,
  state,
  action,
}: PlacementFormProps & { spaceId: string; unplaced: AdminFloorData["unplaced"] }) {
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="panelSpaceId" value={spaceId} />
      <p className="text-sm text-muted">This office is vacant.</p>
      {unplaced.length === 0 ? (
        <p className="text-sm text-muted">Every approved company already has an office.</p>
      ) : (
        <>
          <input type="hidden" name="intent" value="assign" />
          <input type="hidden" name="spaceId" value={spaceId} />
          <SelectField
            name="companyId"
            label="Assign company"
            placeholder="Choose an approved company"
            options={unplaced.map((c) => ({ value: c.id, label: c.name }))}
            errors={state.fieldErrors?.companyId}
          />
          <SubmitButton pendingLabel="Assigning…">Assign to this office</SubmitButton>
        </>
      )}
    </form>
  );
}

function OccupiedOffice({
  company,
  panelSpaceId,
  vacantOffices,
  state,
  action,
}: PlacementFormProps & { company: PlacedCompany; panelSpaceId: string; vacantOffices: MapSpace[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{company.name}</span>
        <CompanyStatusBadge status={company.status} />
      </div>
      {company.status !== "approved" && (
        <p className="text-sm text-muted">
          Not shown on the public map while {company.status}. The office stays reserved for this company.
        </p>
      )}

      <form action={action} className="space-y-3" noValidate>
        <input type="hidden" name="panelSpaceId" value={panelSpaceId} />
        <input type="hidden" name="intent" value="move" />
        <input type="hidden" name="companyId" value={company.id} />
        {vacantOffices.length === 0 ? (
          <p className="text-sm text-muted">There are no vacant offices to move to.</p>
        ) : (
          <>
            <SelectField
              name="spaceId"
              label="Move to"
              placeholder="Choose a vacant office"
              options={vacantOffices.map((s) => ({ value: s.id, label: s.label }))}
              errors={state.fieldErrors?.spaceId}
            />
            <SubmitButton variant="secondary" pendingLabel="Moving…">
              Move company
            </SubmitButton>
          </>
        )}
      </form>

      <form action={action} className="space-y-3 border-t border-border pt-4">
        <input type="hidden" name="panelSpaceId" value={panelSpaceId} />
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="companyId" value={company.id} />
        <SubmitButton variant="danger" pendingLabel="Removing…">
          Remove from office
        </SubmitButton>
      </form>
    </div>
  );
}

function SpaceDetailsForm({ space }: { space: MapSpace }) {
  const [state, action] = useActionState(updateSpaceDetails, initialFormState);
  return (
    <form action={action} className="space-y-3 border-t border-border pt-4" noValidate>
      <h3 className="text-sm font-semibold text-ink">Space details</h3>
      <Message state={state} />
      <input type="hidden" name="spaceId" value={space.id} />
      <InputField
        name="label"
        label="Name"
        defaultValue={state.values?.label ?? space.label}
        maxLength={80}
        errors={state.fieldErrors?.label}
      />
      <InputField
        name="capacity"
        label="Capacity"
        optional
        inputMode="numeric"
        defaultValue={state.values?.capacity ?? (space.capacity ? String(space.capacity) : "")}
        errors={state.fieldErrors?.capacity}
      />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save details
      </SubmitButton>
    </form>
  );
}
