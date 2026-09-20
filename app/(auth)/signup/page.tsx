"use client";

import Link from "next/link";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function SignupChooser() {
  const { t } = useLanguage();

  return (
    <PageShell maxWidth="max-w-sm">
      <Link href="/login" className="mb-4 inline-block text-sm text-ash underline hover:text-ink">
        ← {t("Back to log in")}
      </Link>
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Join PriceBook")}</h1>
      <p className="mt-1 text-center text-sm text-ash">{t("How will you be using it?")}</p>

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/signup/customer"
          className="group rounded border border-line bg-field-raised px-4 py-4 text-left transition-colors hover:border-value hover:bg-value"
        >
          <p className="font-display text-[15px] font-medium text-ink group-hover:text-white">{t("I'm shopping")}</p>
          <p className="mt-0.5 text-sm text-ash group-hover:text-white/90">{t("Find the best local prices near me.")}</p>
        </Link>
        <Link
          href="/signup/merchant"
          className="group rounded border border-line bg-field-raised px-4 py-4 text-left transition-colors hover:border-value hover:bg-value"
        >
          <p className="font-display text-[15px] font-medium text-ink group-hover:text-white">{t("I own a store")}</p>
          <p className="mt-0.5 text-sm text-ash group-hover:text-white/90">{t("List my prices and reach nearby shoppers.")}</p>
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-ash">
        {t("Already have an account?")}{" "}
        <Link href="/login" className="underline text-ink">
          {t("Log in")}
        </Link>
      </p>
    </PageShell>
  );
}
