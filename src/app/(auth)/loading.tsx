export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-2/3 rounded bg-surface-muted" />
      <div className="h-64 rounded-xl bg-surface-muted" />
    </div>
  );
}
