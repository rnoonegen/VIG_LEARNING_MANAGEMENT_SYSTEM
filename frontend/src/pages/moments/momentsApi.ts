import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MomentCollectionDetailDto,
  MomentCollectionDto,
  MomentStudentOptionDto,
  MomentSubjectOptionDto,
} from '@vig/shared';
import { fromDateKey } from '@vig/shared';
import { del, get, patch, post } from '@/lib/api';

/**
 * One place for the moments queries, so the list and the detail page invalidate
 * the same keys. Every write returns the refreshed collection, which is written
 * straight into the detail cache rather than triggering a second round trip.
 */

const ROOT = '/moment-collections';

export const momentKeys = {
  all: ['moment-collections'] as const,
  list: (params?: Record<string, string | undefined>) =>
    ['moment-collections', 'list', params ?? {}] as const,
  detail: (id: string) => ['moment-collections', 'detail', id] as const,
  subjects: ['moment-collections', 'subjects'] as const,
  students: (id: string) => ['moment-collections', 'students', id] as const,
};

export function useMoments(params?: { studentId?: string; subjectId?: string }) {
  return useQuery({
    queryKey: momentKeys.list(params),
    queryFn: () => get<MomentCollectionDto[]>(ROOT, params),
  });
}

export function useMoment(id: string) {
  return useQuery({
    queryKey: momentKeys.detail(id),
    queryFn: () => get<MomentCollectionDetailDto>(`${ROOT}/${id}`),
  });
}

export function useMomentSubjects(enabled = true) {
  return useQuery({
    queryKey: momentKeys.subjects,
    queryFn: () => get<MomentSubjectOptionDto[]>(`${ROOT}/subjects`),
    enabled,
  });
}

/** Everyone the caller may add, with the already-placed ones marked. */
export function useMomentStudents(collectionId: string, enabled = true) {
  return useQuery({
    queryKey: momentKeys.students(collectionId),
    queryFn: () => get<MomentStudentOptionDto[]>(`${ROOT}/${collectionId}/students`),
    enabled,
  });
}

/** Writes that change a single collection all settle the caches the same way. */
function useCollectionMutation<TVars>(
  fn: (vars: TVars) => Promise<MomentCollectionDetailDto>,
  collectionId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (fresh) => {
      queryClient.setQueryData(momentKeys.detail(fresh.id), fresh);
      void queryClient.invalidateQueries({ queryKey: momentKeys.all });
      if (collectionId) {
        void queryClient.invalidateQueries({ queryKey: momentKeys.students(collectionId) });
      }
    },
  });
}

export function useCreateMoment() {
  return useCollectionMutation((body: unknown) =>
    post<MomentCollectionDetailDto>(ROOT, body),
  );
}

export function useUpdateMoment(id: string) {
  return useCollectionMutation((body: unknown) =>
    patch<MomentCollectionDetailDto>(`${ROOT}/${id}`, body),
  );
}

export function useDeleteMoment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ id: string }>(`${ROOT}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: momentKeys.all }),
  });
}

export function useAddEntry(collectionId: string) {
  return useCollectionMutation(
    (body: unknown) => post<MomentCollectionDetailDto>(`${ROOT}/${collectionId}/entries`, body),
    collectionId,
  );
}

export function useUpdateEntry(collectionId: string) {
  return useCollectionMutation(
    ({ entryId, body }: { entryId: string; body: unknown }) =>
      patch<MomentCollectionDetailDto>(`${ROOT}/${collectionId}/entries/${entryId}`, body),
    collectionId,
  );
}

export function useDeleteEntry(collectionId: string) {
  return useCollectionMutation(
    (entryId: string) =>
      del<MomentCollectionDetailDto>(`${ROOT}/${collectionId}/entries/${entryId}`),
    collectionId,
  );
}

/** Signed upload target for an entry photo (AD-04 — bytes bypass the API). */
export async function uploadEntryPhoto(file: File): Promise<string> {
  const target = await post<{ path: string; uploadUrl: string; token: string }>(
    `${ROOT}/upload-url`,
    { fileName: file.name, mimeType: file.type },
  );

  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error('The photo did not finish uploading. Please try again.');

  return target.path;
}

// --- Presentation helpers ----------------------------------------------------

/**
 * "12 – 16 Aug 2026", collapsing whatever the two ends share. A range inside one
 * month should not print the month twice, and a single day should not print a
 * range at all.
 */
export function formatDateRange(startKey: string, endKey: string): string {
  const start = fromDateKey(startKey);
  const end = fromDateKey(endKey);

  const day = (d: Date) => String(d.getUTCDate());
  const monthYear = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  const month = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d);

  if (startKey === endKey) return `${day(start)} ${monthYear(start)}`;
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    if (start.getUTCMonth() === end.getUTCMonth()) {
      return `${day(start)} – ${day(end)} ${monthYear(end)}`;
    }
    return `${day(start)} ${month(start)} – ${day(end)} ${monthYear(end)}`;
  }
  return `${day(start)} ${monthYear(start)} – ${day(end)} ${monthYear(end)}`;
}

/** "Aarav, Sara and 3 more" — a summary line that never runs past one row. */
export function formatNameList(names: string[], max = 2): string {
  const firsts = names.map((n) => n.split(' ')[0] ?? n);
  if (firsts.length === 0) return 'No students yet';
  if (firsts.length <= max) return new Intl.ListFormat('en-GB').format(firsts);
  return `${firsts.slice(0, max).join(', ')} and ${firsts.length - max} more`;
}
