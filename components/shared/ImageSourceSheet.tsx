"use client";

import { useRef } from "react";
import { Camera as CameraIcon, Image as ImageIcon, Upload } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

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

  if (!open) return null;

  function base64ToFile(base64: string, format: string): File {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    return new File([bytes], `photo.${format || "jpg"}`, { type: `image/${format || "jpeg"}` });
  }

  async function nativePick(source: CameraSource) {
    onClose();
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source,
        quality: 80,
        saveToGallery: false,
        // This app only ever needs enough detail to read a price tag,
        // product label, or store photo — not a full-resolution shot — and
        // capping the longest edge keeps the capture light on memory.
        width: 1600
      });
      if (photo.base64String) onPicked(base64ToFile(photo.base64String, photo.format));
    } catch (e: any) {
      // The person backed out of the camera/picker without choosing
      // anything — not an error worth surfacing.
      if (e?.message && !/cancel/i.test(e.message)) {
        onError?.(source === CameraSource.Camera ? t("Couldn't open the camera.") : t("Couldn't open your photos."));
      }
    }
  }

  function handleTakePhoto() {
    if (Capacitor.isNativePlatform()) {
      nativePick(CameraSource.Camera);
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
      </div>
    </>
  );
}
