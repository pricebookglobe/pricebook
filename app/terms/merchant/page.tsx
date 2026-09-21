import { TermsLayout, Section } from "@/components/legal/TermsLayout";

export default function MerchantTerms() {
  return (
    <TermsLayout title="Terms &amp; Conditions — Store Owners" updated="21 September 2026">
      <Section title="1. Agreement to these terms">
        <p>
          These terms apply to anyone who registers a store on PriceBook. By submitting your registration you
          agree to these terms. If you don't agree, please don't register a store.
        </p>
      </Section>

      <Section title="2. Verification and approval">
        <p>
          Every new store is reviewed before it goes live. We may ask for your commercial registration
          certificate, a photo of your store, and other details to confirm you're a real, operating business. We
          can reject or delay a registration that doesn't check out, without owing an explanation beyond what's
          shown in the app.
        </p>
      </Section>

      <Section title="3. Accuracy of your prices and inventory">
        <p>
          You're responsible for the accuracy of the prices, items, and store details you list. Shoppers rely on
          this information to make in-store decisions, so keep it up to date. PriceBook is not responsible for
          disputes between you and a shopper over pricing shown in the app.
        </p>
      </Section>

      <Section title="4. Documents and images you submit">
        <p>
          By uploading your CR certificate, store photo, or logo, you confirm you have the right to submit them
          and you grant PriceBook the right to store and display them as part of operating the service (for
          example, showing your logo and photo to shoppers, and your certificate to our admin team for
          verification).
        </p>
      </Section>

      <Section title="5. Store ranking and reviews">
        <p>
          PriceBook may show shoppers how your prices compare to other stores nearby, and may display shopper
          reviews of your store. We don't guarantee any particular ranking or review outcome.
        </p>
      </Section>

      <Section title="6. Prohibited conduct">
        <p>
          Don't submit false registration documents, list prices you don't actually charge, create duplicate or
          fake store listings, or attempt to manipulate rankings or reviews. We may suspend or delete a store
          account for any of these.
        </p>
      </Section>

      <Section title="7. Account freezing and removal">
        <p>
          We may freeze or remove your store's admin account — for example, for suspected fraud, repeated
          inaccurate pricing, or abuse of shoppers — with notice where practical.
        </p>
      </Section>

      <Section title="8. Fees">
        <p>
          Listing a store on PriceBook is currently free. We may introduce fees for certain features in the
          future; if we do, we'll give existing store owners notice beforehand.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          PriceBook is provided "as is." To the fullest extent allowed by law, we aren't liable for lost sales,
          disputes with shoppers, or other losses arising from your use of the service.
        </p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>
          We may update these terms from time to time. Continuing to operate your store on PriceBook after an
          update means you accept the revised terms.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>Questions about these terms can be sent to the admin contact address listed in the app.</p>
      </Section>
    </TermsLayout>
  );
}
