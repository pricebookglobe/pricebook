"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  BarcodeScanner as MlkitBarcodeScanner,
  BarcodeFormat as MlkitBarcodeFormat,
  GoogleBarcodeScannerModuleInstallState
} from "@capacitor-mlkit/barcode-scanning";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A live camera viewfinder with a targeting box — the barcode has to be
// framed inside it to scan, same as any real barcode scanner app. This
// replaces the earlier "take one photo of whatever's in frame" approach,
// which had no guide for where to point the camera and could pick up the
// wrong code (or nothing at all) if the barcode wasn't precisely centered
// in that single shot.
//
// Inside the native app, this hands off entirely to NativeScannerBridge
// below, which drives the phone's own ML Kit scanner (Android/iOS native
// camera APIs) instead of a browser getUserMedia stream decoded frame-by-
// frame in JS. That's what the two earlier rounds of JS-level tuning
// (format hints, resolution, autofocus retries, camera-selection fallback)
// couldn't fully fix — Android WebView camera stacks vary enough between
// devices that no amount of getUserMedia tuning matches a real native
// scanner. The web build (anyone visiting the site in an ordinary mobile
// or desktop browser) keeps the original zxing-based implementation below,
// since there's no native layer to hand off to there.
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  if (Capacitor.isNativePlatform()) {
    return <NativeScannerBridge onDetected={onDetected} onClose={onClose} />;
  }
  return <WebBarcodeScanner onDetected={onDetected} onClose={onClose} />;
}

// Every retail barcode format this app's products can carry — kept as one
// list shared by both the native and web scanners below.
const RETAIL_FORMATS_MLKIT = [
  MlkitBarcodeFormat.Ean13,
  MlkitBarcodeFormat.Ean8,
  MlkitBarcodeFormat.UpcA,
  MlkitBarcodeFormat.UpcE,
  MlkitBarcodeFormat.Code128,
  MlkitBarcodeFormat.Itf
];

// Drives the native app's own full-screen ML Kit scanner UI (the plugin's
// `scan()` call draws its own camera view and targeting box — nothing of
// this component's own viewfinder JSX below is used here). On Android this
// needs the "Google Barcode Scanner" Play Services module, which isn't
// guaranteed to already be installed on every device; if it's missing,
// this kicks off the install, waits for it to finish, then starts the scan
// — so the very first native scan may show a short "Setting up scanner…"
// delay, and every scan after that is instant.
function NativeScannerBridge({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"starting" | "installing" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function runScan() {
      try {
        if (Capacitor.getPlatform() === "android") {
          const { available } = await MlkitBarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!available) {
            setStatus("installing");
            await new Promise<void>((resolve, reject) => {
              let listenerHandle: { remove: () => void } | undefined;
              MlkitBarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (event) => {
                if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
                  listenerHandle?.remove();
                  resolve();
                } else if (event.state === GoogleBarcodeScannerModuleInstallState.FAILED) {
                  listenerHandle?.remove();
                  reject(new Error("install failed"));
                }
              }).then((handle) => {
                listenerHandle = handle;
              });
              MlkitBarcodeScanner.installGoogleBarcodeScannerModule().catch(reject);
            });
          }
        }
        if (cancelled) return;
        setStatus("starting");
        const { barcodes } = await MlkitBarcodeScanner.scan({ formats: RETAIL_FORMATS_MLKIT });
        if (cancelled) return;
        const code = barcodes[0]?.rawValue;
        if (code) onDetected(code);
        else onClose();
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setError(
          e?.message?.includes("CANCELED") || e?.message?.includes("cancel")
            ? null // user backed out of the native scanner UI — just close quietly
            : t("Couldn't open the barcode scanner.")
        );
        if (e?.message?.includes("CANCELED") || e?.message?.includes("cancel")) onClose();
      }
    }

    runScan();
    return () => {
      cancelled = true;
    };
  }, [onDetected, onClose, t]);

  // The plugin draws its own full-screen native camera UI on top of
  // everything else the instant scan() resolves its camera permission
  // check, so this component itself only needs to render something for the
  // brief moment before that — the Play Services install wait, or an error
  // if one comes back.
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
      >
        <X size={20} strokeWidth={2} />
      </button>
      {status === "installing" && <p className="text-sm text-white">{t("Setting up the barcode scanner…")}</p>}
      {status === "error" && error && (
        <div className="px-6 text-center">
          <p className="text-sm text-white">{error}</p>
          <button onClick={onClose} className="mt-3 rounded-sm bg-white px-4 py-2 font-display text-sm font-medium text-ink">
            {t("Close")}
          </button>
        </div>
      )}
    </div>
  );
}

// The original browser-based scanner: a live getUserMedia viewfinder
// decoded frame-by-frame with zxing. Still used for the website (anyone
// scanning from an ordinary mobile or desktop browser tab has no native
// layer to call into).
function WebBarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const detectedRef = useRef(false);
  const refocusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Nudges continuous autofocus back on periodically. Some Android WebView
    // camera stacks silently drop a focusMode constraint after the first
    // autofocus lock (there's no event for this — it just quietly stops
    // refocusing), so a one-time applyConstraints() call right after the
    // stream opens isn't always enough. Re-asserting it every couple of
    // seconds is cheap and harmless on devices that don't need it.
    function keepRefocusing(track: MediaStreamTrack) {
      if (refocusTimerRef.current) clearInterval(refocusTimerRef.current);
      refocusTimerRef.current = setInterval(() => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] }).catch(() => {});
      }, 2000);
    }

    // Picks the actual back camera by device label when facingMode can't be
    // trusted to do it. Needed because a meaningful slice of Android WebView
    // camera stacks treat facingMode as a loose hint rather than a real
    // selector — "environment" can silently resolve to the front camera on
    // some devices. Among the back cameras, prefers the plain standard lens
    // over an Ultra Wide or Telephoto one specifically: a phone with
    // several rear lenses (most iPhones since the 11) labels them
    // separately, and "environment" alone doesn't say which one to use —
    // the non-standard lenses often can't rack focus down to where a
    // barcode held at a normal scanning distance actually is. That doesn't
    // throw or error, it just silently never manages to read anything,
    // which looks exactly like "the scanner keeps running and never finds
    // a result" even though the camera feed looks completely normal.
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

    // A moderate, not maximal, resolution: zxing decodes by drawing every
    // frame onto a canvas and reading its raw pixels back in JS, and that
    // cost scales with frame size. Asking for 1080p can actually make
    // scanning WORSE on a mid/low-end Android CPU — fewer decode attempts
    // fit in per second — even though it sounds like it should help
    // accuracy. 1280x720 is the sweet spot: enough detail to resolve a
    // barcode held at a normal distance, cheap enough to decode many times
    // a second.
    const baseVideo: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };

    // Swaps the stream for one from the plain standard back lens if the
    // facingMode constraint below landed on an Ultra Wide/Telephoto one
    // instead — see findBackCameraDeviceId above for why that matters.
    // Only swaps when the replacement actually opens successfully, so a
    // failed re-request never loses a stream that was already working.
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
        // Try first with an EXACT back-camera requirement — on iOS Safari
        // "environment" as a plain ideal hint already reliably picks A
        // back camera, but several Android WebView camera stacks need the
        // stronger "exact" form or they can default to the front camera.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideo, facingMode: { exact: "environment" } }
        });
        return await ensureStandardBackLens(stream);
      } catch {
        // "exact" is unsupported on this device/browser — fall back to a
        // soft hint, and if even that doesn't reliably land on the back
        // camera, pick it explicitly by enumerating devices.
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

        const stream = await openStream();
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        const controls = await reader.decodeFromStream(stream, videoRef.current ?? undefined, (result) => {
          if (result && !detectedRef.current && !cancelled) {
            detectedRef.current = true;
            onDetected(result.getText());
          }
        });
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
        // for continuous autofocus explicitly (and keep re-asserting it —
        // see keepRefocusing) rather than relying on whatever the
        // browser's default happened to be.
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
      if (refocusTimerRef.current) clearInterval(refocusTimerRef.current);
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
