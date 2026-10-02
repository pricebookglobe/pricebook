"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A live camera viewfinder with a targeting box — the barcode has to be
// framed inside it to scan, same as any real barcode scanner app. This
// replaces the earlier "take one photo of whatever's in frame" approach,
// which had no guide for where to point the camera and could pick up the
// wrong code (or nothing at all) if the barcode wasn't precisely centered
// in that single shot.
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const detectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        // Every barcode an actual product in this app carries is one of
        // these retail formats — restricting to just them (instead of
        // zxing's default "try every format it knows") cuts the work done
        // per frame dramatically. On Android especially, where decode
        // speed was the main reason scans felt unreliable compared to
        // iOS, this alone makes a real difference.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF
        ]);

        const reader = new BrowserMultiFormatReader(hints, {
          // Re-attempt a decode as fast as the device can manage instead
          // of zxing's default pacing — Android's slower default camera
          // pipeline needs every attempt it can get, where iOS was
          // already fast enough that this wasn't the bottleneck.
          delayBetweenScanAttempts: 50,
          delayBetweenScanSuccess: 500
        });

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: "environment",
              // A higher requested resolution gives the decoder more
              // pixels to work with on a small, far-off barcode — iOS
              // cameras tend to default to a usably high resolution on
              // their own, Android ones more often don't.
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
          },
          videoRef.current ?? undefined,
          (result) => {
            if (result && !detectedRef.current && !cancelled) {
              detectedRef.current = true;
              onDetected(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;

        // iOS Safari's camera continuously refocuses on its own by
        // default, which is a big part of why scanning already felt
        // reliable there. Chrome on Android frequently does not — it can
        // lock focus after the initial frame, leaving a close-up barcode
        // permanently soft/blurry until something forces a refocus. Where
        // the device exposes focusMode as a controllable capability, ask
        // for continuous autofocus explicitly rather than relying on
        // whatever the browser's default happened to be.
        const stream = videoRef.current?.srcObject;
        const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined;
        if (track) {
          trackRef.current = track;
          const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
          if (capabilities?.focusMode?.includes("continuous")) {
            track
              .applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] })
              .catch(() => {});
          }
          setTorchSupported(Boolean((capabilities as { torch?: boolean } | undefined)?.torch));
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.name === "NotAllowedError"
              ? t("Camera access was denied — allow camera access in your browser settings and try again.")
              : t("Couldn't access the camera.")
          );
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected, t]);

  // Low light is the other big Android-vs-iOS gap — iPhone camera
  // sensors handle dim store lighting well enough on their own, but a lot
  // of Android cameras need the torch to pick out a barcode's contrast at
  // all indoors. Only shown when the device actually reports torch
  // support, so it never appears as a dead button.
  function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black">
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

      {!error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative h-28 w-64 sm:h-36 sm:w-80">
            <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-value" />
            <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-value" />
            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-value" />
            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-value" />
          </div>
          <p className="mt-4 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white">
            {t("Center the barcode inside the box")}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-24 px-6 text-center">
          <p className="text-sm text-white">{error}</p>
          <button onClick={onClose} className="mt-3 rounded-sm bg-white px-4 py-2 font-display text-sm font-medium text-ink">
            {t("Close")}
          </button>
        </div>
      )}
    </div>
  );
}
