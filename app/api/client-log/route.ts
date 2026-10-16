import { NextRequest, NextResponse } from "next/server";

// TEMPORARY DIAGNOSTIC ENDPOINT — not a permanent feature. Three separate
// blind fixes to the in-page camera's "Take Photo" flow (the OS-camera
// backgrounding hand-off, a video-frame-decode race on the shutter
// button, a stuck-getUserMedia fallback) have all failed to resolve a
// report of "camera opens, no file ever gets attached" on Android. Rather
// than guess a fourth time, InPageCamera now reports each step of what
// actually happens on the reporting device — which getUserMedia call
// succeeded, whether/when the video became ready, whether the shutter was
// tapped, whether the capture actually produced a blob — to this endpoint,
// which just writes it straight to the server's own log stream (visible
// via Render's log viewer) tagged [client-camera]. Once the real failure
// point is identified from a live report, both this endpoint and the
// logEvent() calls in InPageCamera.tsx should be removed.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[client-camera]", JSON.stringify(body));
  } catch (e) {
    console.log("[client-camera] failed to parse report", e);
  }
  // Always 200 — this must never surface as an error to the person using
  // the camera; it's an out-of-band report, not part of the real flow.
  return NextResponse.json({ ok: true });
}
