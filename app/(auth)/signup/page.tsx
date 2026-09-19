"use client";

import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function SignupChooser() {
  const { t } = useLanguage();

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Join PriceBook")}</h1>
      <p className="mt-1 text-center text-sm text-ash">{t("How will you be using it?")}</p>

      <div className="mt-6 flex flex-col gap-3">
        <a
          href="/signup/customer"
          className="rounded border border-line bg-field-raised px-4 py-4 text-left hover:border-value"
        >
          <p className="font-display text-[15px] font-medium text-ink">{t("I'm shopping")}</p>
          <p className="mt-0.5 text-sm text-ash">{t("Find the best local prices near me.")}</p>
        </a>
        <a
          href="/signup/merchant"
          className="rounded border border-line bg-field-raised px-4 py-4 text-left hover:border-value"
        >
          <p className="font-display text-[15px] font-medium text-ink">{t("I own a store")}</p>
          <p className="mt-0.5 text-sm text-ash">{t("List my prices and reach nearby shoppers.")}</p>
        </a>
      </div>

      <p className="mt-6 text-center text-sm text-ash">
        {t("Already have an account?")}{" "}
        <a href="/login" className="underline text-ink">
          {t("Log in")}
        </a>
      </p>
    </PageShell>
  );
}
