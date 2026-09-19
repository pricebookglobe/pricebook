import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppPage({ children, maxWidth = "max-w-3xl" }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <main className="velvet-field flex min-h-screen flex-col md:flex-row">
      {/* Sidebar: logo, name, nav, logout — separated from the main content
          by a solid light green-white divider line, not just whitespace. */}
      <aside className="flex shrink-0 flex-col border-b-2 border-[#EAF6F0] bg-field-raised/70 px-6 py-6 md:w-64 md:border-b-0 md:border-r-2">
        <AccountMenu />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex justify-end px-5 py-4 sm:px-8">
          <LanguageSwitcher />
        </header>

        <div className={`mx-auto w-full px-5 pb-12 ${maxWidth}`}>
          <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-xl sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
