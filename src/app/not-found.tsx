import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">This room isn&apos;t on the floor plan.</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or has moved.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to the floor
      </Link>
    </div>
  );
}
