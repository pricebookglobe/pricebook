import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Footer } from "./Footer";

export function AppPage({ children, maxWidth = "max-w-3xl" }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="app-gradient flex min-h-screen flex-col md:flex-row">
      {/* Dark sidebar on a light blue gradient page — logo, name, nav, and
          logout all in one column, matching the reference layout. */}
      <aside className="flex shrink-0 flex-col bg-ink px-6 py-8 md:w-64">
        <AccountMenu />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex justify-end px-5 py-4 sm:px-8">
          <LanguageSwitcher />
        </header>

        <div className={`mx-auto w-full flex-1 px-5 pb-12 ${maxWidth}`}>
          <div className="rounded-lg border border-line bg-field-raised p-6 shadow-lg sm:p-8">
            {children}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
