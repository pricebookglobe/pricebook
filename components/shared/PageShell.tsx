export function PageShell({
  children,
  maxWidth = "max-w-xl"
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="velvet-field min-h-screen px-5 py-10">
      <div className={`mx-auto ${maxWidth}`}>
        <div className="mb-6 flex justify-center">
          <img src="/pricebook-logo-dark.png" alt="PriceBook" className="h-auto w-20" />
        </div>
        <div className="rounded-lg border border-white/10 bg-field-raised p-6 shadow-2xl sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
