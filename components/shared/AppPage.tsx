"use client";

import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Footer } from "./Footer";
import { MobileTopBar } from "./MobileTopBar";
import { MobileTabBar } from "./MobileTabBar";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

export function AppPage({ children, maxWidth = "max-w-3xl" }: { children: React.ReactNode; maxWidth?: string }) {
  const isNativeApp = useIsNativeApp();

  // Inside the packaged Android app only: a slim top bar and a fixed bottom
  // tab bar, styled like a native app, instead of the website's sidebar.
  // The website itself — including on a phone's browser — never sees this;
  // it always renders the layout below.
  if (isNativeApp) {
    return (
      <div className="app-gradient relative flex min-h-screen flex-col overflow-hidden">
        {/* Faint centered wordmark watermark, purely decorative, so the app
            reads as its own branded product rather than a browser tab even
            on screens with little other imagery. Constrained by width only
            (h-auto) so the image's own aspect ratio decides its height —
            forcing an equal h-[80vw]/w-[80vw] box here used to squash the
            (taller-than-wide) shield into a square, stretching it. */}
        <img
          src="/pricebook-icon-transparent.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-1/2 h-auto w-[65vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.09]"
        />

        <div className="relative z-10 flex min-h-screen flex-col">
          <MobileTopBar />

          <div className={`mx-auto w-full flex-1 px-5 pb-24 ${maxWidth}`}>
            <div className="rounded-xl border border-line bg-field-raised p-6 shadow-lg sm:p-8">
              {children}
            </div>
          </div>

          <MobileTabBar />
        </div>
      </div>
    );
  }

  return (
    <div className="app-gradient flex min-h-screen flex-col md:flex-row">
      {/* Dark sidebar on a light blue gradient page — logo, name, nav, and
          logout all in one column, matching the reference layout. */}
      <aside className="flex shrink-0 flex-col bg-ink px-6 py-8 md:w-64">
        <AccountMenu />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex justify-start px-5 py-4 sm:px-8">
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
