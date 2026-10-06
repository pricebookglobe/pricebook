"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera as CameraIcon, Image as ImageIcon, Upload } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { InPageCamera } from "./InPageCamera";

// A bottom-sheet picker offering three explicit, distinct ways to supply an
// image — "Take Photo" (camera), "Photo" (existing photo library), "Upload
// File" (the device's general file browser) — rather than leaving it to
// whatever single picker the OS/browser happens to show by default, which
// varies by platform and can bury the option someone actually wants. Used
// anywhere a person is choosing an existing/new image to hand to the app
// (Check Price's "Enter details" upload, a merchant's store photo), as
// opposed to Snap, which is a quick single action and deliberately opens
// the camera directly with no picker at all.
//
// Always hands back a plain File to onPicked, regardless of which option
// was used or which platform this is running on — native "Take Photo"/
// "Photo" go through Capacitor's Camera plugin (base64 result, converted to
// a File below); "Upload File", and every option on the plain web, go
// through an ordinary hidden <input type="file">. Callers never need to
// know which path was taken.
export function ImageSourceSheet({
  open,
  onClose,
  onPicked,
  onError,
  // Only the "Upload File" option's accept attribute is ever widened past
  // plain images — Take Photo and Photo are always image/*, since a camera
  // or photo library can't produce a PDF. Lets a document-style upload
  // (e.g. a commercial registration certificate, which can legitimately be
  // a photo OR a PDF) use this same sheet instead of a plain file input.
  uploadAccept = "image/*"
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (file: File) => void;
  onError?: (message: string) => void;
  uploadAccept?: string;
}) {
  const { t } = useLanguage();
  const takePhotoInputRef = useRef<HTMLInputElement>(null);
  const choosePhotoInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  // "Take Photo" on the native app no longer goes through Capacitor's
  // Camera.getPhoto() plugin at all — see InPageCamera's own comment for
  // why: that plugin hands off to a separate native camera Activity, and
  // real-device testing kept showing Android's low-memory killer reclaim
  // the app's whole process while that heavier native app was in the
  // foreground (reported as the app crashing/resetting). InPageCamera
  // opens an in-page getUserMedia feed instead, the same crash-proof
  // approach BarcodeScanner already uses. "Photo" (the existing photo
  // library) still uses the Camera plugin below — picking an existing
  // image doesn't launch the camera itself, so it isn't this crash.
  const [showInPageCamera, setShowInPageCamera] = useState(false);

  async function nativePick(source: CameraSource) {
    onClose();
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source,
        quality: 80,
        saveToGallery: false,
        // This app only ever needs enough detail to read a price tag,
        // product label, or store photo — not a full-resolution shot — and
        // capping the longest edge keeps the capture light on memory.
        width: 1600
      });
      if (photo.webPath) {
        const blob = await (await fetch(photo.webPath)).blob();
        onPicked(new File([blob], `photo.${photo.format || "jpg"}`, { type: blob.type }));
      }
    } catch (e: any) {
      // The person backed out of the picker without choosing anything —
      // not an error worth surfacing.
      if (e?.message && !/cancel/i.test(e.message)) {
        onError?.(t("Couldn't open your photos."));
      }
    }
  }

  function handleTakePhoto() {
    if (Capacitor.isNativePlatform()) {
      onClose();
      setShowInPageCamera(true);
    } else {
      onClose();
      takePhotoInputRef.current?.click();
    }
  }
  function handleChoosePhoto() {
    if (Capacitor.isNativePlatform()) {
      nativePick(CameraSource.Photos);
    } else {
      onClose();
      choosePhotoInputRef.current?.click();
    }
  }
  function handleUploadFile() {
    // Always a plain file input, native app included — Capacitor's WebView
    // already supports the standard HTML file picker (it opens the OS's
    // own Files/Documents browser), and there's no dedicated Capacitor API
    // for "browse any file" the way there is for the camera and photo
    // library specifically.
    onClose();
    uploadFileInputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPicked(file);
  }

  return (
    <>
      {/* These three stay mounted at all times, open or closed — NOT inside
          an `if (!open) return null` guard like the sheet UI below. Every
          web/non-native option (and "Upload File" even inside the native
          app) works by calling .click() on one of these right after
          onClose() closes the sheet. If the inputs were unmounted along
          with the rest of the sheet the instant onClose() fires, the
          element they're clicking would already be gone from the DOM by
          the time the OS file/photo picker actually returns a file —
          the browser has nowhere left to fire that "change" event, so
          onPicked silently never runs. That's exactly what "upload/take a
          photo on Enter details does nothing at all" looks like: no
          error, no searching status, because the request was never even
          made. */}
      <input
        ref={takePhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input ref={choosePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
      <input ref={uploadFileInputRef} type="file" accept={uploadAccept} className="hidden" onChange={handleInputChange} />

      {/* Rendered through a portal straight onto <body>, not in place here.
          AppPage wraps every screen's content in a couple of nested
          `position: relative` + `z-index` divs (one of them explicitly
          z-10, to sit above the decorative BarcodeArrowWatermark) — in the
          native app layout, that inner z-10 div is a SIBLING of the fixed,
          z-30 bottom tab bar, inside a shared outer stacking context. A
          nested z-index only ever competes with its own siblings: once
          this sheet is painted inside that inner z-10 box, ITS z-[80]
          only outranks other things inside that same box — it can never
          outrank the tab bar's z-30, because that comparison happens one
          level up, where the whole box is worth just z-10. That's why the
          sheet was rendering UNDER the bottom tab bar instead of over it,
          cutting off "Upload File" and hiding "Cancel" beneath it entirely
          (tapping where Cancel should be just tapped the tab bar
          underneath). Portaling to <body> escapes that nested context
          completely, the same fix FreeTextSearch's dropdown already uses
          for a similar clipping problem. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50" onClick={onClose}>
            <div
              className="w-full max-w-md rounded-t-2xl bg-field p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <button
                type="button"
                onClick={handleTakePhoto}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-field-raised active:bg-field-raised"
              >
                <CameraIcon size={20} strokeWidth={2} className="text-ink" />
                <span className="font-display text-sm text-ink">{t("Take Photo")}</span>
              </button>
              <button
                type="button"
                onClick={handleChoosePhoto}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-field-raised active:bg-field-raised"
              >
                <ImageIcon size={20} strokeWidth={2} className="text-ink" />
                <span className="font-display text-sm text-ink">{t("Photo")}</span>
              </button>
              <button
                type="button"
                onClick={handleUploadFile}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-field-raised active:bg-field-raised"
              >
                <Upload size={20} strokeWidth={2} className="text-ink" />
                <span className="font-display text-sm text-ink">{t("Upload File")}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full rounded-lg border border-line px-3 py-2.5 text-center font-display text-sm text-ash transition-colors hover:bg-field-raised"
              >
                {t("Cancel")}
              </button>
            </div>
          </div>,
          document.body
        )}

      {showInPageCamera && (
        <InPageCamera
          onCapture={(file) => {
            setShowInPageCamera(false);
            onPicked(file);
          }}
          onClose={() => setShowInPageCamera(false)}
          onError={onError}
        />
      )}
    </>
  );
}
