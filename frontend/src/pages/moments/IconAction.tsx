import { cn } from '@/lib/ui';

/**
 * A round control that rides on top of a card.
 *
 * Used for manage actions that sit over a photograph, so it carries its own
 * translucent surface rather than borrowing contrast from whatever image happens
 * to be behind it. Shared by the moment cards and the entry cards so the two
 * grids behave identically under the cursor.
 */
export function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-ink-2 shadow-sm backdrop-blur transition-colors',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-violet hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
