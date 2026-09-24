import Link from "next/link";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-line bg-ink px-4 py-3 font-mono text-[13px] leading-relaxed text-field">
      <code>{children}</code>
    </pre>
  );
}

function Field({ name, required, children }: { name: string; required?: boolean; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-ink">
        {name}
        {required && <span className="ml-1 text-flag">*</span>}
      </td>
      <td className="px-3 py-2 align-top text-sm text-ink/80">{children}</td>
    </tr>
  );
}

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-field px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <img src="/pricebook-full-transparent.png" alt="PriceBook" className="h-auto w-48" />
        </div>

        <div className="rounded-lg border border-ink/10 bg-field-raised p-6 shadow-sm sm:p-10">
          <h1 className="font-display text-2xl font-semibold text-ink">Inventory API</h1>
          <p className="mt-1 text-sm text-ash">
            For connecting your own point-of-sale or inventory system so your prices update on PriceBook
            automatically, without anyone logging in to upload a file by hand.
          </p>

          <div className="prose-terms mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-ink/90">
            <section>
              <h2 className="font-display text-base font-medium text-ink">Getting your API key</h2>
              <p className="mt-1.5 text-ink/80">
                Log in to PriceBook as a store owner, go to <strong>Settings → Store API</strong>, and you'll find
                your <strong>Store ID</strong> and <strong>API key</strong> there. Keep the key secret — anyone who
                has it can update your store's prices. If it's ever exposed, click Regenerate in Settings to
                immediately invalidate it and issue a new one.
              </p>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Endpoint</h2>
              <CodeBlock>{`POST https://pricebook.institute-of-ai.org/api/stores/{store_id}/bulk-inventory`}</CodeBlock>
              <p className="mt-1.5 text-ink/80">
                Replace <code className="font-mono text-xs">{"{store_id}"}</code> with your own Store ID from
                Settings.
              </p>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Authentication</h2>
              <p className="text-ink/80">Send your API key as a bearer token:</p>
              <CodeBlock>{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Request body</h2>
              <p className="text-ink/80">
                A JSON object with an <code className="font-mono text-xs">items</code> array. Each item is one
                product and its price at your store. Send as many items as you like in one call, up to 1000 per
                request.
              </p>
              <CodeBlock>{`{
  "items": [
    {
      "item_name": "Al Ain Fresh Milk",
      "brand": "Al Ain",
      "size": 1,
      "unit": "L",
      "category": "dairy",
      "price": 1.10,
      "currency": "JOD"
    },
    {
      "item_name": "Snickers",
      "brand": "Mars",
      "size": 50,
      "unit": "g",
      "category": "snacks",
      "price": 0.45
    }
  ]
}`}</CodeBlock>

              <table className="mt-3 w-full text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-1.5 font-mono text-xs uppercase text-ash">Field</th>
                    <th className="px-3 py-1.5 font-mono text-xs uppercase text-ash">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <Field name="item_name" required>
                    The product's name.
                  </Field>
                  <Field name="category" required>
                    A category label (e.g. "dairy", "snacks", "beverages").
                  </Field>
                  <Field name="price" required>
                    A positive number. Uses your existing store currency setting if you don't send one.
                  </Field>
                  <Field name="brand">Optional. Helps match this to the same product at other stores.</Field>
                  <Field name="size">Optional numeric size (e.g. 1, 500, 50).</Field>
                  <Field name="unit">Optional unit for size (e.g. "L", "ml", "g", "kg", "pcs").</Field>
                  <Field name="currency">Optional. Defaults to "JOD" if not sent.</Field>
                  <Field name="barcode">
                    Optional. If you have it, sending the real barcode lets future customer barcode scans match
                    this exact item with certainty instead of by name matching.
                  </Field>
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Updating prices later</h2>
              <p className="text-ink/80">
                This same call is how you keep prices current — there's no separate "update" endpoint. Send the
                same <code className="font-mono text-xs">item_name</code>/<code className="font-mono text-xs">brand</code>/
                <code className="font-mono text-xs">size</code>/<code className="font-mono text-xs">unit</code>/
                <code className="font-mono text-xs">category</code> combination again (or the same{" "}
                <code className="font-mono text-xs">barcode</code>) with a new price, and PriceBook updates the
                existing item instead of creating a duplicate. Run this on whatever schedule fits your business —
                hourly, daily, or after each price change in your own system.
              </p>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Response</h2>
              <CodeBlock>{`{
  "added": 12,
  "updated": 48,
  "total": 60,
  "failed": [
    { "row": 5, "reason": "price \\"abc\\" is not a valid positive number" }
  ]
}`}</CodeBlock>
              <p className="mt-1.5 text-ink/80">
                <code className="font-mono text-xs">added</code> is how many items were new,{" "}
                <code className="font-mono text-xs">updated</code> is how many already existed and just got a new
                price. <code className="font-mono text-xs">failed</code> lists any items that couldn't be
                processed, by position in your array (1-indexed) and why — the rest of the batch still goes
                through even if a few rows have a problem.
              </p>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Example (curl)</h2>
              <CodeBlock>{`curl -X POST \\
  https://pricebook.institute-of-ai.org/api/stores/YOUR_STORE_ID/bulk-inventory \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [
      { "item_name": "Snickers", "brand": "Mars", "size": 50, "unit": "g", "category": "snacks", "price": 0.45 }
    ]
  }'`}</CodeBlock>
            </section>

            <section>
              <h2 className="font-display text-base font-medium text-ink">Limits</h2>
              <p className="text-ink/80">
                Up to 1000 items per request. A brand new product takes a moment longer to process than a price
                update to an existing one, since it needs to be indexed for search — a large first-time upload of
                many new items may take a little while to complete; price-only updates to items you've already
                registered are fast regardless of how many you send.
              </p>
            </section>
          </div>

          <Link href="/" className="mt-8 inline-block text-sm text-ash underline hover:text-ink">
            ← Back to PriceBook
          </Link>
        </div>
      </div>
    </main>
  );
}
