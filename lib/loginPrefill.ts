// A one-time handoff for "just signed up" — stashes the email/password the
// person just typed into sessionStorage right before sending them to
// /login, so the login form can prefill both fields instead of making them
// retype what they just entered. Read once and immediately cleared, so it
// never lingers in storage or gets reused on a later visit.
const KEY = "pricebook:loginPrefill";

export function stashLoginPrefill(email: string, password: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, password }));
  } catch {
    // storage unavailable — the person just retypes their details, no harm done
  }
}

export function takeLoginPrefill(): { email: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
