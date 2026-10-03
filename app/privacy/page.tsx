import { TermsLayout, Section } from "@/components/legal/TermsLayout";

export default function PrivacyPolicy() {
  return (
    <TermsLayout title="Privacy Policy" updated="3 October 2026">
      <Section title="1. Who this applies to">
        <p>
          This policy covers PriceBook's website and its Android and iOS apps — all three are the same product,
          just reached different ways. It applies to shoppers, store owners (merchants), and anyone who visits
          without an account.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p>We collect:</p>
        <ul className="ml-5 list-disc">
          <li>
            <strong>Account details</strong> — email address and password (stored securely, never in plain text),
            and for merchants, store name, address/area, and any verification documents submitted during store
            signup.
          </li>
          <li>
            <strong>Location</strong> — with your permission, your device's GPS position, used to find nearby
            stores and prices, and to let a merchant confirm their store's location. We do not track or store a
            history of your movements; only your current position is used, live, each time the app needs it.
          </li>
          <li>
            <strong>Camera and photos</strong> — with your permission, photos you take or choose (of a barcode,
            product, or receipt) are used to identify products and prices, and are sent to our product-recognition
            service to process. A merchant's storefront photo is stored so shoppers can confirm they've found the
            right store.
          </li>
          <li>
            <strong>Price reports and reviews</strong> — prices, product details, and ratings you submit, along
            with which store and product they're about.
          </li>
          <li>
            <strong>Basic usage information</strong> — standard web/app server logs (e.g. IP address, device/
            browser type, pages visited) used for security and troubleshooting.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use it">
        <p>We use the information above to:</p>
        <ul className="ml-5 list-disc">
          <li>Show you nearby stores and compare prices;</li>
          <li>Identify products and read prices from photos and barcodes you submit;</li>
          <li>Let merchants manage their store listing, prices, and verification status;</li>
          <li>Maintain price-report and review credibility (e.g. who reported what, and when);</li>
          <li>Keep the service secure and working properly, and investigate abuse.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="4. Location and camera permissions">
        <p>
          The app only requests your device's location or camera when a feature you're actively using needs it
          (finding nearby stores and prices; scanning a barcode; taking a photo to identify a product). You can
          deny or later revoke either permission in your device settings — the app will simply be unable to offer
          the features that depend on it (e.g. it can't tell you nearby prices without knowing roughly where you
          are).
        </p>
      </Section>

      <Section title="5. Sharing">
        <p>We share information only where necessary to run the service:</p>
        <ul className="ml-5 list-disc">
          <li>
            With our infrastructure providers (database hosting, server hosting, and the AI service used to read
            photos and barcodes), solely to operate PriceBook;
          </li>
          <li>
            Publicly within the app itself, where a feature is inherently shared — e.g. a price you report, or a
            review you leave, is visible to other shoppers and the relevant store, the same way it would be on
            any price-comparison or review service;
          </li>
          <li>If required by law, or to protect the safety or rights of PriceBook, its users, or the public.</li>
        </ul>
      </Section>

      <Section title="6. Data retention and deletion">
        <p>
          We keep account and store data for as long as your account is active. You can request deletion of your
          account and associated personal data at any time by contacting us (see Section 8) — price reports and
          reviews already submitted may be retained in de-identified form, since they also reflect other shoppers'
          and stores' information.
        </p>
      </Section>

      <Section title="7. Children">
        <p>PriceBook is not directed at children, and we do not knowingly collect personal information from children.</p>
      </Section>

      <Section title="8. Contact">
        <p>
          Questions about this policy, or requests to access or delete your data, can be sent to the email address
          associated with your PriceBook account's support channel, or through the Settings page in the app.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We may update this policy as the app changes. We'll update the date at the top of this page when we do.
        </p>
      </Section>
    </TermsLayout>
  );
}
