import Link from "next/link";

// Public, unauthenticated pages — reachable whether or not someone is
// logged in, since either a shopper or a store owner may want to reread
// these before or after signing up. Deliberately wider and plainer than
// PageShell (built for compact auth forms), since this is long-form text.
export function TermsLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-field px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <img src="/pricebook-full-transparent.png" alt="PriceBook" className="h-auto w-48" />
        </div>

        <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-sm sm:p-10">
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ash">Last updated {updated}</p>

          <div className="prose-terms mt-6 flex flex-col gap-4 text-[15px] leading-relaxed text-ink/90">
            {children}
          </div>

          <p className="mt-8 text-xs text-ash">
            This document is a general starting template and has not been reviewed by a lawyer. Please have it
            checked by legal counsel before relying on it for real customers or store owners.
          </p>

          <Link href="/" className="mt-6 inline-block text-sm text-ash underline hover:text-ink">
            ← Back to PriceBook
          </Link>
        </div>
      </div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-medium text-ink">{title}</h2>
      <div className="mt-1.5 flex flex-col gap-2 text-ink/80">{children}</div>
    </section>
  );
}
