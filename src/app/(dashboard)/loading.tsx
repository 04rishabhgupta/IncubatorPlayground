export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-1/3 rounded bg-surface-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-24 rounded-xl bg-surface-muted" />
      </div>
      <div className="h-48 rounded-xl bg-surface-muted" />
    </div>
  );
}
