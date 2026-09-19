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
          <img src="/pricebook-logo-light.png" alt="PriceBook" className="h-auto w-56" />
        </div>

        <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
