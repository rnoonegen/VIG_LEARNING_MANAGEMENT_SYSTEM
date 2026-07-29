import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Upload } from 'lucide-react';
import type { StudentSummaryDto } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { MomentsGrid } from '@/components/MomentsGrid';

/**
 * The media gallery. Photos and videos with educational context — what happened,
 * when, which students, and which class it came from (Flow 12).
 */
export function MomentsPage() {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title="Moments"
        description="Photos and videos from classes, with the context that makes them meaningful."
        action={
          <Button icon={<ImagePlus size={16} />} onClick={() => setAdding(true)}>
            Add Moment
          </Button>
        }
      />

      <MomentsGrid
        endpoint="/moments"
        emptyTitle="No moments yet"
        emptyDescription="Capture what students are doing and tag who was involved. One photo can be linked to several children without being uploaded twice."
        emptyAction={
          <Button icon={<ImagePlus size={16} />} onClick={() => setAdding(true)}>
            Add Moment
          </Button>
        }
      />

      {adding ? <AddMomentModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

interface UploadTarget {
  path: string;
  uploadUrl: string;
  token: string;
}

function AddMomentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => get<StudentSummaryDto[]>('/students'),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a photo or video first.');

      // Media never proxies through the API: we ask for a signed URL, PUT the
      // bytes straight to storage, then send only the metadata (AD-04).
      const target = await post<UploadTarget>('/moments/upload-url', {
        fileName: file.name,
        mimeType: file.type,
      });

      const upload = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!upload.ok) throw new Error('The upload did not complete. Please try again.');

      return post('/moments', {
        title: title.trim(),
        caption: caption.trim() || undefined,
        studentIds,
        media: [{ storagePath: target.path, mimeType: file.type, sizeBytes: file.size }],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['moments'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add moment"
      description="One media item can be tagged to several students."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!file || !title.trim() || studentIds.length === 0 || create.isPending}
          >
            {create.isPending ? 'Uploading…' : 'Save Moment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Photo or video" required error={error}>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-line bg-lavender-2 px-4 py-8 text-center">
            <Upload size={22} className="text-violet" />
            <span className="text-sm font-medium text-ink">
              {file ? file.name : 'Choose a photo or video'}
            </span>
            <span className="text-xs text-ink-3">Tap to browse</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </label>
        </Field>

        <Field label="Title" htmlFor="moment-title" required>
          <Input
            id="moment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Science Experiment"
          />
        </Field>

        <Field label="Caption" htmlFor="moment-caption" hint="Optional. What was happening?">
          <Textarea
            id="moment-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Exploring how different materials react with water."
          />
        </Field>

        <Field label="Who is in this moment?" required>
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-[12px] border border-line p-2">
            {students?.map((student) => (
              <label
                key={student.id}
                className="touch-target flex cursor-pointer items-center gap-3 rounded-[10px] px-2 hover:bg-lavender-2"
              >
                <input
                  type="checkbox"
                  checked={studentIds.includes(student.id)}
                  onChange={(e) =>
                    setStudentIds(
                      e.target.checked
                        ? [...studentIds, student.id]
                        : studentIds.filter((id) => id !== student.id),
                    )
                  }
                  className="h-4 w-4 accent-[var(--color-violet)]"
                />
                <span className="text-sm text-ink">{student.fullName}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
