import type { ReactNode } from 'react';

/**
 * The sign-in surface. Calm, warm, generously spaced — the first impression of
 * the product and the one place a soft lavender atmosphere carries the whole page.
 *
 * Sized to sit inside one screen rather than to overflow it: a login form that
 * arrives with a scrollbar reads as a page that did not finish loading. The
 * spacing tightens on short viewports instead of pushing the button out of
 * sight, and `dvh` keeps a mobile browser's collapsing address bar from eating
 * the bottom of it.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-lavender via-canvas to-canvas px-4 py-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          {/* Placeholder mark — replaced by the supplied VIG artwork, unchanged. */}
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-violet text-lg font-semibold text-white">
            V
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold text-navy">Valmiki LMS System</span>
            <span className="block text-[11px] text-ink-3">Valmiki International Gurukulam</span>
          </span>
        </div>

        <div className="rounded-[20px] border border-line bg-card p-6 shadow-[0_1px_2px_rgba(17,22,92,0.04)] sm:p-7">
          <div className="mb-5 text-center">
            <h1 className="text-[24px]">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
          </div>
          {children}
        </div>

        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
