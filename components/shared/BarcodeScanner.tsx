"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
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

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
      >
        <X size={20} strokeWidth={2} />
      </button>

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
