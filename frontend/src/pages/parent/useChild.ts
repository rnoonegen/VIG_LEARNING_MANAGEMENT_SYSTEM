import { useQuery } from '@tanstack/react-query';
import type { ParentChildDto } from '@vig/shared';
import { get } from '@/lib/api';

/**
 * The linked children for the signed-in parent.
 *
 * A parent may be linked to several students (Q8), so every parent page resolves
 * the active child through this hook rather than assuming there is only one.
 */
export function useChildren() {
  return useQuery({
    queryKey: ['parent', 'children'],
    queryFn: () => get<ParentChildDto[]>('/parent/children'),
  });
}
