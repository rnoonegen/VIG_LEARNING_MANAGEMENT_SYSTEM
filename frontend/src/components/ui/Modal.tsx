import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/ui';

/**
 * A modal on desktop; a bottom sheet on phones (Design System §11 — reflow, do
 * not miniaturise). Same content, same hierarchy, different container.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Inside the app shell the page does not scroll — <main> does — so locking
    // the body alone would leave the background scrolling behind the dialog.
    // Both are locked, and the shell one is simply absent on the sign-in pages
    // and the full-screen class record, where the body really is the scroller.
    const scroller = document.querySelector<HTMLElement>('[data-app-scroll]');
    document.body.style.overflow = 'hidden';
    if (scroller) scroller.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (scroller) scroller.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/25 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden bg-card',
          'rounded-t-[24px] sm:rounded-[16px]',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate">{title}</h3>
            {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target -mr-2 -mt-1 flex items-center justify-center rounded-full text-ink-2 hover:bg-lavender"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
