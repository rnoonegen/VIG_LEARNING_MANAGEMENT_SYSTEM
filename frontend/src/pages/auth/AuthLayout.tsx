import type { ReactNode } from 'react';

/**
 * The sign-in surface. Calm, warm, generously spaced — the first impression of
 * the product and the one place a soft lavender atmosphere carries the whole page.
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-lavender via-canvas to-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
          {/* Placeholder mark — replaced by the supplied VIG artwork, unchanged. */}
          <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-violet text-lg font-semibold text-white">
            V
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold text-navy">Valmiki LMS System</span>
            <span className="block text-[11px] text-ink-3">Valmiki International Gurukulam</span>
          </span>
        </div>

        <div className="rounded-[20px] border border-line bg-card p-6 shadow-[0_1px_2px_rgba(17,22,92,0.04)] sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-[26px]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p> : null}
          </div>
          {children}
        </div>

        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
