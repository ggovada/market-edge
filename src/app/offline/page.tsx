export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
        You’re offline
      </h1>
      <p className="mt-2 text-sm text-muted">
        Cached views may still be available. Reconnect to refresh live prices and
        sync trades.
      </p>
    </div>
  );
}
