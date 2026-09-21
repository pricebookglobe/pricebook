import { LanguageSwitcher } from "./LanguageSwitcher";
import { Footer } from "./Footer";

export function PageShell({
  children,
  maxWidth = "max-w-xl"
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="velvet-field flex min-h-screen flex-col px-5 py-10">
      <div className={`mx-auto w-full flex-1 ${maxWidth}`}>
        <div className="mb-6 flex justify-center">
          <img src="/pricebook-full-transparent.png" alt="PriceBook" className="h-auto w-56" />
        </div>

        <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-xl sm:p-8">
          <div className="mb-4">
            <LanguageSwitcher />
          </div>
          {children}
        </div>
      </div>

      <Footer />
    </main>
  );
}
