import { ButtonLink } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

const pillars = [
  {
    title: "Interactive floor map",
    body: "A top-down plan of the floor where every office is clickable and shows who works there.",
  },
  {
    title: "Company directory",
    body: "Search approved companies by name or industry and jump straight to their office on the map.",
  },
  {
    title: "Connect and book",
    body: "Chat in real time, send an email, or request an appointment with a company or a team member.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <section className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-700">Virtual startup floor</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Meet the companies on your floor.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted">{siteConfig.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/directory">Browse the directory</ButtonLink>
          <ButtonLink href="/register/company" variant="secondary">
            Register your company
          </ButtonLink>
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3" aria-label="What the platform offers">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-semibold text-ink">{pillar.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{pillar.body}</p>
          </article>
        ))}
      </section>

      <p className="mt-10 rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 text-sm text-muted">
        The interactive floor map is being built next. Until then, use the directory to find companies.
      </p>
    </div>
  );
}
