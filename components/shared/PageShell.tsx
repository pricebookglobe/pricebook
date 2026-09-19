import { LanguageSwitcher } from "./LanguageSwitcher";

export function PageShell({
  children,
  maxWidth = "max-w-xl"
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="velvet-field min-h-screen px-5 py-10">
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>

      <div className={`mx-auto ${maxWidth}`}>
        <div className="mb-6 flex justify-center">
          {/* A solid dark chip behind the logo — without it, the logo's
              green accent visually merges into the velvet background
              whenever the drifting gradient happens to be green-toned. */}
          <div className="rounded-2xl bg-ink/70 px-6 py-4 shadow-lg">
            <img src="/pricebook-logo-dark.png" alt="PriceBook" className="h-auto w-40" />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-field-raised p-6 shadow-2xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
