"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";
import { FloorMap } from "@/components/floor/floor-map";
import { MapControls, MapLegend } from "@/components/floor/map-controls";
import { useMapViewport } from "@/components/floor/use-map-viewport";
import { Alert } from "@/components/ui/alert";
import { InputField, SelectField } from "@/components/ui/field";
import { CompanyStatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePlacement, updateSpaceDetails } from "@/lib/admin/floor-actions";
import type { AdminFloorData, PlacedCompany } from "@/lib/floor/admin-queries";
import type { MapSpace } from "@/lib/floor/queries";
import { initialFormState, type FormState } from "@/lib/forms";

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
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
