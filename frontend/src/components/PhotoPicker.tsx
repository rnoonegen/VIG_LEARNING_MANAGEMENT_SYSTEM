import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@vig/shared';
import { errorMessage, post } from '@/lib/api';
import { Avatar } from '@/components/ui/Layout';

interface UploadTarget {
  path: string;
  uploadUrl: string;
  token: string;
}

/**
 * A photo chosen while the person is still being created.
 *
 * The bytes go straight from the browser to the private bucket (AD-04); what
 * comes back is a storage path, which the caller sends with the rest of the form.
 * Nothing is written to the database until the form is submitted, so abandoning
 * the form leaves an orphaned object and no half-made record — the safer way
 * round.
 */
export function PhotoPicker({
  name,
  uploadUrlEndpoint,
  value,
  onChange,
  size = 72,
}: {
  /** Used for the initials shown before a photo is chosen. */
  name: string;
  /** Admin endpoint that issues a signed upload URL, e.g. /students/avatar-upload-url. */
  uploadUrlEndpoint: string;
  value: { path: string; previewUrl: string } | null;
  onChange: (next: { path: string; previewUrl: string } | null) => void;
  size?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | null) => {
    if (!file) return;

    // Checked here as well as in the bucket policy, so the answer arrives
    // before the bytes do.
    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      setError('Use a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError('That photo is larger than 5 MB. Choose a smaller one.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const target = await post<UploadTarget>(uploadUrlEndpoint, {
        fileName: file.name,
        mimeType: file.type,
      });

      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error('The photo did not finish uploading. Please try again.');

      // The bucket is private, so the preview is the local file, not a read URL.
      onChange({ path: target.path, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name || '?'} url={value?.previewUrl ?? null} size={size} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-label={value ? 'Change photo' : 'Add photo'}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-violet transition-colors hover:bg-lavender disabled:text-ink-3"
        >
          <Camera size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            void choose(e.target.files?.[0] ?? null);
            // Reset, so choosing the same file twice still fires a change.
            e.target.value = '';
          }}
        />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-2">Photo</p>
        <p className="text-xs text-ink-3">
          {uploading ? 'Uploading…' : 'Optional. JPEG, PNG or WebP, up to 5 MB.'}
        </p>
        {value && !uploading ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-1 text-xs text-ink-2 underline hover:text-danger"
          >
            Remove
          </button>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
