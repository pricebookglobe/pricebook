import { TermsLayout, Section } from "@/components/legal/TermsLayout";

export default function CustomerTerms() {
  return (
    <TermsLayout title="Terms &amp; Conditions — Shoppers" updated="21 September 2026">
      <Section title="1. Agreement to these terms">
        <p>
          These terms apply to anyone who creates or uses a PriceBook shopper account to search for or compare
          grocery prices. By creating an account you agree to these terms. If you don't agree, please don't use
          the shopper side of PriceBook.
        </p>
      </Section>

      <Section title="2. What PriceBook is">
        <p>
          PriceBook helps you find and compare grocery prices at stores near you. Prices come from store owners,
          from other shoppers reporting what they saw, and from automated extraction of photos and text you
          submit. We do our best to keep this accurate, but we don't independently verify every price, and prices
          can change at any time without notice.
        </p>
      </Section>

      <Section title="3. No guarantee on price accuracy">
        <p>
          Prices, availability, and store details shown on PriceBook are for guidance only. Always confirm the
          price at the store before purchasing. PriceBook is not responsible for differences between what's shown
          in the app and what you're charged in-store.
        </p>
      </Section>

      <Section title="4. Your account">
        <p>
          You're responsible for keeping your login details secure and for anything that happens under your
          account. Give us accurate information when you sign up. We may freeze or remove an account that's used
          to submit false price reports, abuse other users, or otherwise misuse the service.
        </p>
      </Section>

      <Section title="5. Location and search history">
        <p>
          Checking prices near you requires access to your device's location — you can decline, but nearby-price
          search won't work as well without it. You can choose whether your search history is kept for up to a
          year or deleted automatically when you log out, from your account settings.
        </p>
      </Section>

      <Section title="6. Reviews and messages">
        <p>
          Reviews and messages you send to stores should be honest and related to your real experience. We may
          remove content that's abusive, fraudulent, or unrelated to using the service.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          PriceBook is provided "as is." To the fullest extent allowed by law, we aren't liable for losses arising
          from price inaccuracies, service interruptions, or your reliance on information shown in the app.
        </p>
      </Section>

      <Section title="8. Changes to these terms">
        <p>
          We may update these terms from time to time. Continuing to use PriceBook after an update means you
          accept the revised terms.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>Questions about these terms can be sent to the admin contact address listed in the app.</p>
      </Section>
    </TermsLayout>
  );
}
