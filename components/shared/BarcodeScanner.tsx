"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A live camera viewfinder with a targeting box — the barcode has to be
// framed inside it to scan, same as any real barcode scanner app.
//
// This in-page scanner has been through several engine experiments: a
// native ML Kit hand-off (crashed — see below), a Quagga2 rewrite (three
// rounds of real-device testing each turned up a different way it failed:
// silent Web Worker failure, decode-area cropping in the wrong coordinate
// space, no periodic autofocus re-assertion leaving Android permanently
// blurry — and it was still unreliable on Android even after fixing all of
// that), and a revert back to zxing (@zxing/browser + @zxing/library),
// which already had a long history of hard-won real-device fixes behind it
// (camera selection avoiding Ultra Wide/Telephoto lenses,
// continuous-autofocus re-assertion, retail format hints, resolution
// tuning). zxing still left Android needing several tries per scan, though
// — it decodes every frame in JS on the main thread, scanning raw pixels
// off a canvas, which is inherently slower and less consistent than a real
// hardware-backed decoder.
//
// The current approach: try the browser/OS's own native barcode engine
// first (Chrome's Shape Detection API, `window.BarcodeDetector` — on
// Android this is backed directly by Google ML Kit running in Play
// Services, not another JS library), and only fall back to the
// battle-tested zxing path above where that native API isn't available
// (iOS Safari/WKWebView, most desktop browsers). This is a genuinely
// different kind of fix from the three engine swaps before it: those all
// replaced one JS-decodes-the-pixels library with another; this instead
// hands decoding to the OS/browser's own hardware-accelerated engine
// wherever it exists, and keeps the proven JS fallback everywhere else —
// so a device without native support loses nothing it had before.
//
// Also used on Android instead of handing off to the native app's own ML
// Kit scanner (a separate full-screen native Activity, driven by
// @capacitor-mlkit/barcode-scanning's scan() call) — that hand-off is
// exactly the "memory-heavy full-screen Activity" scenario that pushes
// Android's low-memory killer to reclaim something right as it opens,
// reported directly as the app crashing back to the splash screen after a
// scan or two. Using this same in-page scanner everywhere — Android,
// iOS/web, desktop — removes that whole crash surface: there's no separate
// native screen to launch, so nothing for the OS to kill out from under the
// app. Capacitor's own WebView already forwards getUserMedia's camera
// permission request to Android's real runtime permission prompt
// (BridgeWebChromeClient.onPermissionRequest), so this needs no native code
// of its own to work here.
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  return <WebBarcodeScanner onDetected={onDetected} onClose={onClose} />;
}

// The retail formats an actual product in this app ever carries — used to
// restrict BOTH decode engines below to just these, instead of either
// one's default "try every format it knows". Values here are each
// engine's own name for the same format.
const RETAIL_FORMATS_NATIVE = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];

// A live getUserMedia viewfinder, decoded by whichever engine the device
// actually has. Camera selection/focus/torch handling below is shared by
// both engines — it's about getting a good, sharp back-camera feed, not
// about how a frame gets turned into a barcode.
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
  const nativeLoopActiveRef = useRef(false);

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

    // Decodes with the browser/OS's own native barcode engine — Chrome's
    // Shape Detection API (`window.BarcodeDetector`), which on Android is
    // backed directly by Google ML Kit running in Play Services: a real
    // hardware-accelerated decoder maintained by Google, not another JS
    // library drawing frames to a canvas and scanning pixels in the main
    // thread like every engine tried here before (zxing included). Where
    // it's available this should be both faster and far more reliable
    // than any in-page JS decoder can be on mid/low-end Android hardware.
    // Returns true if it actually took over decoding, false if the API
    // isn't there (iOS Safari/WKWebView, most desktop browsers) or didn't
    // report support for any of the retail formats this app needs, so the
    // caller knows to fall back to zxing instead.
    async function startNativeDetector(stream: MediaStream): Promise<boolean> {
      const DetectorCtor = (window as any).BarcodeDetector;
      if (!DetectorCtor) return false;
      let detector: any;
      try {
        if (typeof DetectorCtor.getSupportedFormats === "function") {
          const supported: string[] = await DetectorCtor.getSupportedFormats();
          const usable = RETAIL_FORMATS_NATIVE.filter((f) => supported.includes(f));
          if (usable.length === 0) return false;
          detector = new DetectorCtor({ formats: usable });
        } else {
          detector = new DetectorCtor({ formats: RETAIL_FORMATS_NATIVE });
        }
      } catch {
        // Some formats unsupported, or the API refused construction for
        // some other reason — zxing can still try.
        return false;
      }

      nativeLoopActiveRef.current = true;
      controlsRef.current = {
        stop: () => {
          nativeLoopActiveRef.current = false;
        }
      };

      async function tick() {
        if (!nativeLoopActiveRef.current || cancelled || detectedRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const results = await detector.detect(video);
            if (results.length > 0 && !detectedRef.current && !cancelled) {
              detectedRef.current = true;
              onDetected(results[0].rawValue);
              return;
            }
          } catch {
            // A frame that couldn't be decoded isn't an error worth
            // stopping over — just try the next one.
          }
        }
        if (nativeLoopActiveRef.current && !cancelled) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      return true;
    }

    // Falls back to the zxing-based decoder — see the file-level comment
    // above for why this stayed the known-reliable baseline through
    // earlier engine experiments. Still used for iOS/desktop, where the
    // native BarcodeDetector API generally isn't available at all.
    async function startZxing(stream: MediaStream) {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

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
        delayBetweenScanAttempts: 50,
        delayBetweenScanSuccess: 500
      });

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
    }

    async function start() {
      try {
        const stream = await openStream();
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        // iOS Safari's camera continuously refocuses on its own by
        // default, which is a big part of why scanning already felt
        // reliable there. Chrome on Android frequently does not — it can
        // lock focus after the initial frame, leaving a close-up barcode
        // permanently soft/blurry until something forces a refocus. Where
        // the device exposes focusMode as a controllable capability, ask
        // for continuous autofocus explicitly (and keep re-asserting it —
        // see keepRefocusing) rather than relying on whatever the
        // browser's default happened to be. Done up front, before either
        // decode engine starts, since it applies regardless of which one
        // ends up doing the decoding.
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

        // The native detector reads frames straight off the <video>
        // element, so it needs the stream attached first — zxing's
        // decodeFromStream does that attachment itself, so it's only
        // needed here for the native path.
        const usedNative = await (async () => {
          const DetectorCtor = (window as any).BarcodeDetector;
          if (!DetectorCtor) return false;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            try {
              await videoRef.current.play();
            } catch {
              // Autoplay can be blocked in rare cases — the native loop's
              // own readyState check below just keeps waiting either way.
            }
          }
          return startNativeDetector(stream);
        })();
        if (!usedNative) await startZxing(stream);
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
