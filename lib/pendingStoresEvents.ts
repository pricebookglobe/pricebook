// A tiny pub/sub so the sidebar's "Store requests" badge count updates the
// moment an admin approves, rejects, or deletes a pending store — without
// the two components needing a shared data layer. The admin pages that
// change the pending count call notifyPendingStoresChanged(); AccountMenu
// listens for it and re-fetches its own count.
const EVENT_NAME = "pricebook:pending-stores-changed";

export function notifyPendingStoresChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function onPendingStoresChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
