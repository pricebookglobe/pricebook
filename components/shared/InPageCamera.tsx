"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap, ZapOff, Circle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

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
  onError
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onError?: (message: string) => void;
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

  useEffect(() => {
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

    // Higher than BarcodeScanner's 1280x720 — this is capturing a photo a
    // person will look at (a product, a price tag, a store front), not
    // feeding a per-frame decoder, so it's worth the extra detail. Still
    // capped well below a modern sensor's native resolution to keep
    // memory/upload size sane, matching the width Snap already asked
    // Capacitor's plugin for.
    const baseVideo: MediaTrackConstraints = { width: { ideal: 1600 }, height: { ideal: 1600 } };

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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideo, facingMode: { exact: "environment" } }
        });
        return await ensureStandardBackLens(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { ...baseVideo, facingMode: "environment" } });
          return await ensureStandardBackLens(stream);
        } catch {
          const deviceId = await findBackCameraDeviceId();
          return navigator.mediaDevices.getUserMedia({
            video: deviceId ? { ...baseVideo, deviceId: { exact: deviceId } } : baseVideo
          });
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
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Autoplay blocked in rare cases — the person can still tap
            // the shutter once the feed catches up.
          }
        }
        setReady(true);

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

  function capture() {
    if (capturingRef.current) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    capturingRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      capturingRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        capturingRef.current = false;
        if (blob) onCapture(new File([blob], "snap.jpg", { type: "image/jpeg" }));
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
          onClick={capture}
          aria-label={t("Take photo")}
          className="absolute bottom-10 z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 active:bg-white/30"
        >
          <Circle size={48} strokeWidth={0} className="fill-white" />
        </button>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-24 px-6 text-center">
          <p className="text-sm text-white">{error}</p>
          <button onClick={onClose} className="mt-3 rounded-sm bg-white px-4 py-2 font-display text-sm font-medium text-ink">
            {t("Close")}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
