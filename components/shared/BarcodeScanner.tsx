"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A brand new scanning module, built on a completely different engine than
// either of the two tried before:
//
//   1. @capacitor-mlkit/barcode-scanning's native scan() hand-off — opened a
//      SEPARATE full-screen native Android Activity/process outside the
//      WebView, which Android's low-memory killer could reclaim out from
//      under the app with no JS-side hook able to catch it — reported
//      directly as the app crashing back to the splash screen after a scan
//      or two. Removed entirely.
//   2. @zxing/browser + @zxing/library, decoding getUserMedia frames by
//      drawing each one to a canvas and reading it back in our own JS loop.
//      Reliable in the end, but it's the second implementation, not a third
//      option, and this request specifically asked for a scanner "completely
//      distinct from the two previous implementations we tried."
//
// This one uses Quagga2 (@ericblade/quagga2) — a mature, widely used,
// independently-maintained real-time barcode engine (not a zxing fork, not
// a native-Activity hand-off) built specifically for exactly this job: a
// live in-page camera viewfinder decoding 1D retail barcodes continuously,
// in the browser, on both Android and iOS. It never leaves the page (no
// separate native screen for the OS to kill), and its own internal video
// pipeline is more defensive about camera lifecycle than a hand-rolled loop
// — stopping and restarting its stream cleanly handles the camera being
// backgrounded, revoked, or swapped without the "freezes / resets mid-scan"
// failure this request also asked to rule out.
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const detectedRef = useRef(false);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let quaggaModule: typeof import("@ericblade/quagga2").default | null = null;

    // A short run of consecutive agreeing reads before accepting a
    // result — Quagga2 (like any 1D decoder) can occasionally misread a
    // single frame of a real barcode as a different, valid-checksum code.
    // Requiring the same value to come back a few times in a row before
    // acting on it is Quagga2's own documented pattern for this, and costs
    // only a fraction of a second given how many frames/sec it processes.
    const recentReads: string[] = [];
    const CONFIRM_COUNT = 3;

    function handleDetected(result: { codeResult: { code: string | null } }) {
      const code = result?.codeResult?.code;
      if (!code || detectedRef.current || cancelled) return;
      recentReads.push(code);
      if (recentReads.length > CONFIRM_COUNT) recentReads.shift();
      const allAgree = recentReads.length === CONFIRM_COUNT && recentReads.every((c) => c === code);
      if (allAgree) {
        detectedRef.current = true;
        onDetected(code);
      }
    }

    async function start() {
      try {
        const QuaggaImport = await import("@ericblade/quagga2");
        const Quagga = QuaggaImport.default;
        if (cancelled) return;
        quaggaModule = Quagga;

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                type: "LiveStream",
                target: viewportRef.current ?? undefined,
                constraints: {
                  // A moderate, not maximal, resolution — plenty of detail
                  // to resolve a barcode at normal scanning distance,
                  // cheap enough to decode many times a second on a
                  // mid/low-end Android CPU.
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: "environment",
                  aspectRatio: { ideal: 16 / 9 }
                },
                area: {
                  // Only decode the center band framed by the targeting
                  // box below — cuts the per-frame work and, just as
                  // important, avoids false reads from a second barcode
                  // sitting elsewhere in the camera's field of view (a
                  // real failure mode on a store shelf with several
                  // products in frame at once).
                  top: "25%",
                  right: "10%",
                  left: "10%",
                  bottom: "25%"
                }
              },
              locator: {
                patchSize: "medium",
                halfSample: true
              },
              numOfWorkers: 2,
              frequency: 10,
              decoder: {
                // Every barcode an actual product in this app carries is
                // one of these retail formats — restricting to just them
                // (instead of every reader Quagga2 ships) cuts the work
                // done per frame.
                readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader"]
              },
              locate: true
            },
            (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        if (cancelled) {
          Quagga.stop();
          return;
        }

        Quagga.onDetected(handleDetected);
        Quagga.start();
        startedRef.current = true;
        setReady(true);

        // Torch + continuous-autofocus: Quagga2 exposes the live
        // MediaStreamTrack it opened, so the same track-level tuning used
        // by the previous scanner still applies here.
        const track = Quagga.CameraAccess.getActiveTrack();
        if (track) {
          trackRef.current = track;
          const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }) | undefined;
          if (capabilities?.focusMode?.includes("continuous")) {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] }).catch(() => {});
          }
          setTorchSupported(Boolean(capabilities?.torch));
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.name === "NotAllowedError" || /permission/i.test(e?.message ?? "")
              ? t("Camera access was denied — allow camera access in your browser settings and try again.")
              : t("Couldn't access the camera.")
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (quaggaModule && startedRef.current) {
        try {
          quaggaModule.offDetected(handleDetected);
          quaggaModule.stop();
        } catch {
          // already stopped/torn down — nothing further to clean up
        }
      }
      startedRef.current = false;
      trackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDetected, t]);

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

      {/* Quagga2 injects its own <video> (and an overlay <canvas> for the
          locator boxes) into this element — it manages that element's
          contents itself rather than us handing it a <video> ref. */}
      <div ref={viewportRef} className="absolute inset-0 h-full w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_canvas]:hidden" />

      {!error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative h-28 w-64 sm:h-36 sm:w-80">
            <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-value" />
            <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-value" />
            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-value" />
            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-value" />
          </div>
          <p className="mt-4 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white">
            {ready ? t("Center the barcode inside the box") : t("Starting camera…")}
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
