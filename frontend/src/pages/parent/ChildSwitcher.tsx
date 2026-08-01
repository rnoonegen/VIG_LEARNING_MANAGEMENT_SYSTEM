import type { ParentChildDto } from '@vig/shared';
import { Avatar } from '@/components/ui/Layout';
import { cn } from '@/lib/ui';

/**
 * Which child am I looking at.
 *
 * Renders nothing for the common case of one child — a chooser with a single
 * option is noise. With siblings it is the only thing that makes the second
 * child reachable at all, so it sits above the content on every parent page.
 */
export function ChildSwitcher({
  children,
  selectedId,
  onSelect,
}: {
  children: ParentChildDto[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (children.length < 2) return null;

  return (
    <div className="scroll-x mb-5">
      <div className="flex min-w-max gap-2" role="tablist" aria-label="Choose a child">
        {children.map((child) => {
          const active = child.id === selectedId;
          return (
            <button
              key={child.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(child.id)}
              className={cn(
                'touch-target flex items-center gap-2.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-violet bg-lavender text-violet'
                  : 'border-line bg-card text-ink-2 hover:bg-lavender-2',
              )}
            >
              <Avatar name={child.fullName} url={child.avatarUrl} size={24} />
              {child.fullName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
