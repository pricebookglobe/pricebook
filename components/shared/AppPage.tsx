import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppPage({ children, maxWidth = "max-w-3xl" }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#F6F7F5] md:flex-row">
      {/* Sidebar: plain white, a hairline border separates it from the
          content — no color or motion here, this is the working app, not
          the marketing surface. */}
      <aside className="flex shrink-0 flex-col border-b border-line bg-field-raised px-6 py-8 md:w-64 md:border-b-0 md:border-r">
        <AccountMenu />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex justify-end px-5 py-4 sm:px-8">
          <LanguageSwitcher />
        </header>

        <div className={`mx-auto w-full px-5 pb-12 ${maxWidth}`}>
          <div className="rounded-lg border border-line bg-field-raised p-6 shadow-sm sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
