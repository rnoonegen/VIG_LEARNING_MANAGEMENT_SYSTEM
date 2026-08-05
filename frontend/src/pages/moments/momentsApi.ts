import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MomentCollectionDetailDto,
  MomentCollectionDto,
  MomentFolderDto,
  MomentStudentOptionDto,
  StudentMomentEntryDto,
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
  folders: (params?: Record<string, string | undefined>) =>
    ['moment-collections', 'folders', params ?? {}] as const,
  list: (params?: Record<string, string | undefined>) =>
    ['moment-collections', 'list', params ?? {}] as const,
  detail: (id: string) => ['moment-collections', 'detail', id] as const,
  students: (id: string) => ['moment-collections', 'students', id] as const,
  studentEntries: (id: string) => ['moment-collections', 'student-entries', id] as const,
};

/**
 * The folders the Moments page opens on: one per subject, plus "Others" for an
 * admin. Every key here starts with `moment-collections`, so a write anywhere in
 * the section refreshes the counts on the cards along with the lists.
 */
export function useMomentFolders(params?: { studentId?: string }) {
  return useQuery({
    queryKey: momentKeys.folders(params),
    queryFn: () => get<MomentFolderDto[]>(`${ROOT}/folders`, params),
  });
}

export function useMoments(params?: {
  studentId?: string;
  subjectId?: string;
  /** Date search: matches moments whose own span falls inside these dates. */
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: momentKeys.list(params),
    queryFn: () => get<MomentCollectionDto[]>(ROOT, params),
  });
}

/**
 * One child's own entries, for their profile — the entries themselves, not the
 * moments wrapped around them. Keyed under `moment-collections` like everything
 * else here, so writing an entry anywhere refreshes this too.
 */
export function useStudentMomentEntries(studentId: string) {
  return useQuery({
    queryKey: momentKeys.studentEntries(studentId),
    queryFn: () => get<StudentMomentEntryDto[]>(`/students/${studentId}/moment-entries`),
  });
}

/** Where a folder lives under whichever role's section is doing the browsing. */
export function folderPath(basePath: string, folderId: string): string {
  return `${basePath}/f/${folderId}`;
}

export function useMoment(id: string) {
  return useQuery({
    queryKey: momentKeys.detail(id),
    queryFn: () => get<MomentCollectionDetailDto>(`${ROOT}/${id}`),
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

/**
 * Signed upload target for a moment image — an entry's photo or a moment's
 * cover (AD-04 — the bytes bypass the API entirely).
 */
export async function uploadMomentPhoto(file: File): Promise<string> {
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
