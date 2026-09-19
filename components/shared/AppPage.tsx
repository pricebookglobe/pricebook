import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppPage({ children, maxWidth = "max-w-3xl" }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <main className="velvet-field min-h-screen">
      <header className="flex items-start justify-between px-5 py-5 sm:px-8">
        <AccountMenu />
        <LanguageSwitcher />
      </header>

      <div className={`mx-auto px-5 pb-12 ${maxWidth}`}>
        <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
