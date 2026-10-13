import { ButtonLink } from "@/components/ui/button";

export default function CompanyNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-ink">Company not found</h1>
      <p className="mt-3 text-muted">This company doesn&apos;t exist or isn&apos;t listed on the floor.</p>
      <ButtonLink href="/directory" className="mt-6">
        Browse the directory
      </ButtonLink>
    </div>
  );
}
