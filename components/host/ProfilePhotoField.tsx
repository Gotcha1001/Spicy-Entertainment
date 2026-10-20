"use client";
// Single Cloudinary profile image for the dancer (onboarding step 3).
// Needs the profile to exist first (hosts.setImage requires a host row).
import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { fileToResizedDataUri } from "@/lib/imageResize";

export function ProfilePhotoField({
  imageUrl,
}: {
  imageUrl: string | null;
}): React.JSX.Element {
  const upload = useAction(api.uploads.uploadProfilePhoto);
  const removeOld = useAction(api.uploads.deleteProfilePhoto);
  const setImage = useMutation(api.hosts.setImage);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    try {
      const dataUri = await fileToResizedDataUri(file);
      const img = await upload({ imageDataUri: dataUri });
      const { previousPublicId } = await setImage({
        imageUrl: img.url,
        imagePublicId: img.publicId,
      });
      if (previousPublicId) {
        removeOld({ publicId: previousPublicId }).catch((): void => undefined);
      }
      toast.success("Photo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-32 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/25 bg-white/5">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Your profile"
            className="h-full w-full object-cover"
          />
        ) : (
          <ImagePlus className="h-6 w-6 text-neutral-500" />
        )}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {imageUrl ? "Change photo" : "Upload photo"}
        </button>
        <p className="text-xs text-neutral-400">
          Show off your best act. Clothed and family-friendly, please.
        </p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
