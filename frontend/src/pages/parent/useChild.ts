import { useEffect, useState } from 'react';
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

const STORAGE_KEY = 'vig.parent.childId';

/**
 * Which child the parent is currently looking at.
 *
 * Held outside React Query so the choice survives navigation between Home,
 * Learning, Development and Moments — a parent of two children who switches on
 * one tab expects the others to follow, not to snap back to the eldest.
 */
export function useSelectedChild() {
  const { data: children, isLoading } = useChildren();
  const [childId, setChildId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  // A remembered child who is no longer linked — or a first visit — falls back
  // to the first in the list rather than rendering nothing.
  const selected = children?.find((c) => c.id === childId) ?? children?.[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== childId) {
      setChildId(selected.id);
      localStorage.setItem(STORAGE_KEY, selected.id);
    }
  }, [selected, childId]);

  const select = (id: string) => {
    setChildId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return { children: children ?? [], child: selected, isLoading, select };
}
