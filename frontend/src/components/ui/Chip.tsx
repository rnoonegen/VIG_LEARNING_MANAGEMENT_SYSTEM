import {
  ATTENDANCE_META,
  DEV_STAGE_META,
  SKILL_STATUS_META,
  type AttendanceStatus,
  type DevStage,
  type SkillStatus,
} from '@vig/shared';
import { AlertCircle, Check, Circle, Play, Sprout, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';

/**
 * Status is never encoded by colour alone (Design System §10): every chip renders
 * an icon and a label alongside the colour, so meaning survives greyscale,
 * colour-blindness and high-contrast modes.
 */

const ICONS: Record<string, ReactNode> = {
  check: <Check size={12} strokeWidth={3} />,
  circle: <Circle size={12} strokeWidth={3} />,
  play: <Play size={12} strokeWidth={3} />,
  alert: <AlertCircle size={12} strokeWidth={3} />,
  sprout: <Sprout size={12} strokeWidth={3} />,
  trend: <TrendingUp size={12} strokeWidth={3} />,
};

function BaseChip({
  token,
  icon,
  children,
  className,
}: {
  token: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
        TOKEN_STYLES[asToken(token)].chip,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SkillStatusChip({ status }: { status: SkillStatus }) {
  const meta = SKILL_STATUS_META[status];
  return (
    <BaseChip token={meta.color} icon={ICONS[meta.icon]}>
      {meta.label}
    </BaseChip>
  );
}

export function StageChip({ stage }: { stage: DevStage }) {
  const meta = DEV_STAGE_META[stage];
  return (
    <BaseChip token={meta.color} icon={ICONS[meta.icon]}>
      {meta.label}
    </BaseChip>
  );
}

export function AttendanceChip({ status }: { status: AttendanceStatus }) {
  const meta = ATTENDANCE_META[status];
  return <BaseChip token={meta.color}>{meta.label}</BaseChip>;
}

/** Subject identity: colour supports recognition but the name always leads (§8). */
export function SubjectBadge({
  name,
  colorToken,
  sublabel,
}: {
  name: string;
  colorToken?: string | null;
  sublabel?: string;
}) {
  const token = asToken(colorToken);
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', TOKEN_STYLES[token].dot)} />
      {name}
      {sublabel ? <span className="text-xs font-normal text-ink-2">{sublabel}</span> : null}
    </span>
  );
}

export function Pill({
  children,
  token = 'muted',
}: {
  children: ReactNode;
  token?: string;
}) {
  return <BaseChip token={token}>{children}</BaseChip>;
}
