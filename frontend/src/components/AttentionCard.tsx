import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Info, TriangleAlert } from 'lucide-react';
import type { AttentionIssueDto } from '@vig/shared';
import { cn } from '@/lib/ui';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';

const SEVERITY = {
  danger: { tone: 'danger' as const, icon: <TriangleAlert size={16} className="text-danger" /> },
  warning: { tone: 'warning' as const, icon: <AlertTriangle size={16} className="text-warning" /> },
  info: { tone: 'info' as const, icon: <Info size={16} className="text-info" /> },
};

/**
 * One root cause, one card (BR-16).
 *
 * Three classes broken by one teacher's absence appear here as a single issue
 * with a drill-down, so the administrator fixes the cause once instead of
 * working through three identical warnings.
 */
export function AttentionCard({ issue }: { issue: AttentionIssueDto }) {
  const [expanded, setExpanded] = useState(false);
  const severity = SEVERITY[issue.severity];
  const count = issue.affected.length;

  return (
    <Card tone={severity.tone} padded={false} className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 shrink-0">{severity.icon}</span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{issue.title}</p>
          <p className="mt-0.5 text-xs text-ink-2">{issue.detail}</p>

          {count > 1 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
            >
              {expanded ? 'Hide' : `View ${count} affected`}
              <ChevronDown size={13} className={cn('transition-transform', expanded && 'rotate-180')} />
            </button>
          ) : null}
        </div>

        <ButtonLink to={issue.actionHref} variant="tertiary" size="sm" className="shrink-0">
          {issue.actionLabel} →
        </ButtonLink>
      </div>

      {expanded ? (
        <ul className="border-t border-line/60 bg-card/60">
          {issue.affected.map((item) => (
            <li key={item.id} className="border-b border-line/60 last:border-0">
              <Link
                to={item.href}
                className="touch-target flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-lavender-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-ink">{item.label}</span>
                  <span className="block truncate text-[11px] text-ink-3">{item.sublabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
