"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap, ZapOff, Circle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// TEMPORARY DIAGNOSTIC — see app/api/client-log/route.ts's own comment.
// Fires a one-way report of each step of the camera flow to the server
// log so a live failure on a reporting device can actually be seen,
// instead of guessed at. Never throws, never awaited, never blocks
// anything it's called alongside.
function logCameraEvent(event: string, data?: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ event, ...data, ts: Date.now(), ua: navigator.userAgent });
    fetch("/api/client-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(
      () => {}
    );
  } catch {
    // Logging must never be able to break the actual camera flow.
  }
}

// A full-screen in-page camera viewfinder with a capture button — used for
// Snap and "Take Photo" wherever this app needs a fresh photo, INSTEAD of
// Capacitor's own Camera.getPhoto() plugin.
//
// Camera.getPhoto() hands off to a separate native camera Activity/app on
// top of this one. On Android that hand-off is itself the problem: it's a
// memory-heavy Activity transition, and switching resultType from Base64
// to Uri (an earlier fix here) only ever addressed how much data crossed
// the bridge AFTER the photo was taken — it did nothing about the
// transition itself. Real-device testing kept showing the same result
// either way: the app crashes and resets when the native camera opens,
// which is Android's low-memory killer reclaiming this app's whole
// process while the heavier native camera app is in the foreground, not
// something a resultType switch can fix.
//
// BarcodeScanner sidesteps this exact problem already, for the same
// reason: it never leaves the page at all, it just opens a getUserMedia
// video stream in place. This component does the same thing for taking a
// single photo — open the stream, show it full-screen with a capture
// button, and grab one frame onto a canvas when tapped. There's no
// separate screen for Android to kill the app out from under.
export function InPageCamera({
  onCapture,
  onClose,
  onError,
  // Lets a caller offer a way out that doesn't depend on getUserMedia at
  // all (typically falling back to a plain `<input type="file" capture>`,
  // handing off to the OS's own camera app) — shown once the stream fails
  // to start, OR once it's taking suspiciously long to (see START_TIMEOUT_MS
  // below). Some embedding contexts (an in-app browser inside a social
  // app, an older WebView, a camera permission prompt that never actually
  // surfaces) can leave getUserMedia's promise simply never settling —
  // no resolve, no reject — which otherwise reads as "the camera opens
  // [a blank/frozen full-screen view] and then nothing happens," with no
  // error for the existing catch block to ever catch. Without this,
  // there'd be no way out of that state at all except force-closing the
  // app/tab.
  onFallback
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onError?: (message: string) => void;
  onFallback?: () => void;
}) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ready, setReady] = useState(false);
  const capturingRef = useRef(false);
  const refocusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  // If the stream hasn't become ready (and hasn't already failed with its
  // own error) within this long, treat it as stuck rather than leaving the
  // person staring at a frozen/blank camera view with no way forward.
  const START_TIMEOUT_MS = 7000;
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) {
        logCameraEvent("start_timeout_fired");
        setError((current) => current ?? t("Camera is taking too long to start."));
      }
    }, START_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logCameraEvent("mounted");
    let cancelled = false;

    function keepRefocusing(track: MediaStreamTrack) {
      if (refocusTimerRef.current) clearInterval(refocusTimerRef.current);
      refocusTimerRef.current = setInterval(() => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] }).catch(() => {});
      }, 2000);
    }

    async function findBackCameraDeviceId(): Promise<string | undefined> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        const backCams = cams.filter((d) => /back|rear|environment/i.test(d.label) && !/front/i.test(d.label));
        if (backCams.length === 0) return cams.length > 1 ? cams[cams.length - 1].deviceId : undefined;
        const standard = backCams.find((d) => !/ultra|tele/i.test(d.label));
        return (standard ?? backCams[0]).deviceId;
      } catch {
        return undefined;
      }
    }

    // Was 1600x1600 — higher than BarcodeScanner's 1280x720 on the theory
    // that a photo a person will actually look at deserves more detail
    // than a per-frame decoder feed. In practice, on Android this request
    // (plus whatever the rest of the app already has resident) is enough
    // extra memory pressure on the WebView's renderer process to be one
    // of the things Android's low-memory killer reclaims it over — which
    // MainActivity.java's onRenderProcessGone handler survives, but only
    // by relaunching the whole app, losing the in-progress add-item draft
    // ("Snap doesn't continue, lands back on an unrelated screen").
    // 1280x1280 still comfortably beats what a phone camera needs for a
    // product photo, at a real reduction in peak memory during capture.
    const baseVideo: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 1280 } };

    async function ensureStandardBackLens(stream: MediaStream): Promise<MediaStream> {
      const label = stream.getVideoTracks()[0]?.label ?? "";
      if (!/ultra|tele/i.test(label)) return stream;
      const deviceId = await findBackCameraDeviceId();
      if (!deviceId) return stream;
      try {
        const better = await navigator.mediaDevices.getUserMedia({ video: { ...baseVideo, deviceId: { exact: deviceId } } });
        stream.getTracks().forEach((tr) => tr.stop());
        return better;
      } catch {
        return stream;
      }
    }

    async function openStream(): Promise<MediaStream> {
      if (!navigator.mediaDevices?.getUserMedia) {
        logCameraEvent("getusermedia_unsupported");
        throw new Error("getUserMedia not supported");
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideo, facingMode: { exact: "environment" } }
        });
        logCameraEvent("stream_opened", { attempt: "exact-environment" });
        return await ensureStandardBackLens(stream);
      } catch (e: any) {
        logCameraEvent("stream_attempt_failed", { attempt: "exact-environment", name: e?.name, message: e?.message });
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { ...baseVideo, facingMode: "environment" } });
          logCameraEvent("stream_opened", { attempt: "loose-environment" });
          return await ensureStandardBackLens(stream);
        } catch (e2: any) {
          logCameraEvent("stream_attempt_failed", { attempt: "loose-environment", name: e2?.name, message: e2?.message });
          const deviceId = await findBackCameraDeviceId();
          const stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { ...baseVideo, deviceId: { exact: deviceId } } : baseVideo
          });
          logCameraEvent("stream_opened", { attempt: "device-id-fallback", deviceId: !!deviceId });
          return stream;
        }
      }
    }

    async function start() {
      try {
        const stream = await openStream();
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;
          try {
            await video.play();
            logCameraEvent("video_play_resolved");
          } catch (e: any) {
            // Autoplay blocked in rare cases — the person can still tap
            // the shutter once the feed catches up.
            logCameraEvent("video_play_rejected", { name: e?.name, message: e?.message });
          }
          // `ready` (which is what shows the shutter button) used to flip
          // true the instant play() resolved — but play() resolving only
          // means playback started, not that a frame has actually been
          // decoded yet. On a slower Android device there's a real gap
          // between those two moments, and tapping the shutter inside
          // that gap hit the videoWidth===0 guard in capture() below and
          // silently did nothing — exactly "tap the shutter, nothing
          // happens." Wait for an actual decoded frame (readyState >=
          // HAVE_CURRENT_DATA / videoWidth set) before showing the
          // button at all, not just for playback to have started.
          if (video.readyState >= 2 && video.videoWidth > 0) {
            logCameraEvent("ready_immediate", { readyState: video.readyState, videoWidth: video.videoWidth });
            setReady(true);
          } else {
            video.addEventListener(
              "loadeddata",
              () => {
                logCameraEvent("ready_via_loadeddata", { readyState: video.readyState, videoWidth: video.videoWidth });
                if (!cancelled) setReady(true);
              },
              { once: true }
            );
          }
        } else {
          logCameraEvent("ready_no_video_element");
          setReady(true);
        }

        const track = stream.getVideoTracks()[0];
        if (track) {
          trackRef.current = track;
          const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
          if (capabilities?.focusMode?.includes("continuous")) {
            track
              .applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] })
              .catch(() => {});
            keepRefocusing(track);
          }
          setTorchSupported(Boolean((capabilities as { torch?: boolean } | undefined)?.torch));
        }
      } catch (e: any) {
        logCameraEvent("start_failed", { name: e?.name, message: e?.message });
        if (!cancelled) {
          const message =
            e?.name === "NotAllowedError"
              ? t("Camera access was denied — allow camera access in your browser settings and try again.")
              : t("Couldn't access the camera.");
          setError(message);
          onError?.(message);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (refocusTimerRef.current) clearInterval(refocusTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => {});
  }

  function capture(retriesLeft = 30) {
    if (capturingRef.current) {
      logCameraEvent("capture_tap_ignored_already_capturing");
      return;
    }
    const video = videoRef.current;
    if (!video) {
      logCameraEvent("capture_tap_no_video_element");
      return;
    }
    if (video.videoWidth === 0) {
      // Belt-and-braces alongside the loadeddata gating above: if a frame
      // still somehow isn't there yet when the shutter is tapped, wait a
      // few animation frames for one instead of silently doing nothing —
      // give up with an actual error after ~0.5s rather than forever.
      if (retriesLeft <= 0) {
        logCameraEvent("capture_giveup_width_zero", { readyState: video.readyState });
        onError?.(t("Couldn't capture — try again."));
        return;
      }
      if (retriesLeft === 30) logCameraEvent("capture_width_zero_retrying", { readyState: video.readyState });
      requestAnimationFrame(() => capture(retriesLeft - 1));
      return;
    }
    logCameraEvent("capture_running", { videoWidth: video.videoWidth, videoHeight: video.videoHeight });
    capturingRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      logCameraEvent("capture_no_canvas_context");
      capturingRef.current = false;
      onError?.(t("Couldn't capture — try again."));
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        capturingRef.current = false;
        if (blob) {
          logCameraEvent("capture_blob_ok", { size: blob.size });
          onCapture(new File([blob], "snap.jpg", { type: "image/jpeg" }));
        } else {
          logCameraEvent("capture_blob_null");
          onError?.(t("Couldn't capture — try again."));
        }
      },
      "image/jpeg",
      0.85
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
      >
        <X size={20} strokeWidth={2} />
      </button>

      {torchSupported && !error && (
        <button
          onClick={toggleTorch}
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
          className={
            "absolute left-4 top-4 z-10 rounded-full p-2 text-white " +
            (torchOn ? "bg-white/40 hover:bg-white/50" : "bg-white/20 hover:bg-white/30")
          }
        >
          {torchOn ? <ZapOff size={20} strokeWidth={2} /> : <Zap size={20} strokeWidth={2} />}
        </button>
      )}

      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />

      {!error && ready && (
        <button
          onClick={() => capture()}
          aria-label={t("Take photo")}
          className="absolute bottom-10 z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 active:bg-white/30"
        >
          <Circle size={48} strokeWidth={0} className="fill-white" />
        </button>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-24 px-6 text-center">
          <p className="text-sm text-white">{error}</p>
          <div className="mt-3 flex flex-col items-center gap-2">
            {onFallback && (
              <button
                onClick={onFallback}
                className="rounded-sm bg-white px-4 py-2 font-display text-sm font-medium text-ink"
              >
                {t("Use phone's camera instead")}
              </button>
            )}
            <button
              onClick={onClose}
              className={
                onFallback
                  ? "font-display text-sm font-medium text-white underline underline-offset-2"
                  : "rounded-sm bg-white px-4 py-2 font-display text-sm font-medium text-ink"
              }
            >
              {t("Close")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
