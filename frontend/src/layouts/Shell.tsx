import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  GraduationCap,
  Heart,
  HeartHandshake,
  Home,
  Image,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { UnreadCountDto } from '@vig/shared';
import { useAuth } from '@/app/AuthProvider';
import { get } from '@/lib/api';
import { cn } from '@/lib/ui';
import { Avatar } from '@/components/ui/Layout';
import { OfflineBanner } from '@/components/ui/States';
import { InstallPrompt } from '@/components/InstallPrompt';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const ICON_SIZE = 18;

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Home', icon: <Home size={ICON_SIZE} />, end: true },
  { to: '/admin/schedule', label: 'Schedule', icon: <Calendar size={ICON_SIZE} /> },
  { to: '/admin/students', label: 'Students', icon: <Users size={ICON_SIZE} /> },
  { to: '/admin/parents', label: 'Parents', icon: <HeartHandshake size={ICON_SIZE} /> },
  { to: '/admin/curriculum', label: 'Curriculum', icon: <BookOpen size={ICON_SIZE} /> },
  { to: '/admin/teachers', label: 'Teachers', icon: <GraduationCap size={ICON_SIZE} /> },
  // Every moment in the school, whoever created it.
  { to: '/admin/moments', label: 'Moments', icon: <Image size={ICON_SIZE} /> },
];

export const TEACHER_NAV: NavItem[] = [
  { to: '/teacher', label: 'Home', icon: <Home size={ICON_SIZE} />, end: true },
  { to: '/teacher/schedule', label: 'Schedule', icon: <Calendar size={ICON_SIZE} /> },
  // A teacher states their own week and asks for leave against it (F5).
  { to: '/teacher/availability', label: 'My Time', icon: <CalendarClock size={ICON_SIZE} /> },
  { to: '/teacher/students', label: 'Students', icon: <Users size={ICON_SIZE} /> },
  // A teacher writes the curriculum for the levels they are assigned.
  { to: '/teacher/curriculum', label: 'Curriculum', icon: <BookOpen size={ICON_SIZE} /> },
  { to: '/teacher/moments', label: 'Moments', icon: <Image size={ICON_SIZE} /> },
];

export const PARENT_NAV: NavItem[] = [
  { to: '/parent', label: 'Home', icon: <Home size={ICON_SIZE} />, end: true },
  { to: '/parent/learning', label: 'Learning', icon: <BookOpen size={ICON_SIZE} /> },
  { to: '/parent/development', label: 'Development', icon: <Heart size={ICON_SIZE} /> },
  { to: '/parent/moments', label: 'Moments', icon: <Image size={ICON_SIZE} /> },
];

/**
 * The badge on the bell.
 *
 * Counted by the server, not by filtering a downloaded list: the count is zero
 * for an account that has turned notifications off (Settings → Notifications),
 * and a client counting unread rows itself would keep showing the dot the
 * switch was meant to clear. It also stops the shell pulling a hundred
 * notifications a minute to render one number.
 */
function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<UnreadCountDto>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  return data?.unread ?? 0;
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Placeholder mark until the supplied VIG artwork arrives.
          The institutional logo is never recoloured to match the UI palette. */}
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-violet text-sm font-semibold text-white">
        V
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-navy">Valmiki LMS</span>
        <span className="block text-[10px] text-ink-3">Gurukulam</span>
      </span>
    </div>
  );
}

/**
 * One shell, three roles.
 *
 * Desktop uses a persistent left rail where role complexity requires it; mobile
 * collapses to a bottom bar and a compact top bar. Content priority, semantic
 * colour and interaction language are identical across both — it reflows, it does
 * not miniaturise (Design System §11).
 *
 * The shell is the height of the viewport and does not itself scroll: the rail
 * and the top bar are fixed furniture, and only <main> scrolls. Content
 * therefore passes *under* nothing — the bar is opaque and owns its strip of the
 * screen, rather than being a translucent sheet that scrolled text smears
 * through.
 *
 * `dvh` rather than `vh` so a mobile browser collapsing its address bar resizes
 * the shell instead of hiding the last 60px of it.
 */
export function Shell({ nav, settingsPath }: { nav: NavItem[]; settingsPath: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <OfflineBanner />

      {/* min-h-0 lets the row shrink so the scroll lands on <main>, not here. */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop left rail */}
        <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-line bg-card px-4 py-5 md:flex">
          <div className="px-2 pb-6">
            <Wordmark />
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-lavender text-violet' : 'text-ink-2 hover:bg-lavender-2 hover:text-ink',
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Who you are signed in as now lives in the top bar beside the bell,
              where account controls are looked for. The rail keeps navigation. */}
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <NavLink
              to={settingsPath}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-lavender text-violet' : 'text-ink-2 hover:bg-lavender-2',
                )
              }
            >
              <Settings size={ICON_SIZE} />
              Settings
            </NavLink>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="z-30 flex shrink-0 items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
            <Wordmark />
            <NavLink
              to="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              className="touch-target relative flex items-center justify-center rounded-full text-ink-2"
            >
              <Bell size={20} />
              {unread > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </NavLink>
          </header>

          {/* Desktop top bar. Opaque, not a translucent sheet — it is the one
              strip of the screen that never moves, so nothing may show through
              it as the page scrolls beneath. */}
          <header className="z-30 hidden shrink-0 items-center justify-end gap-1 border-b border-line bg-card px-8 py-2.5 md:flex">
            <NavLink
              to="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              className="relative flex items-center justify-center rounded-full p-2 text-ink-2 hover:bg-lavender"
            >
              <Bell size={19} />
              {unread > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </NavLink>

            <span aria-hidden className="mx-2 h-6 w-px bg-line" />

            <NavLink
              to={settingsPath}
              className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 transition-colors hover:bg-lavender-2"
            >
              <Avatar name={user?.fullName ?? ''} url={user?.avatarUrl} size={30} />
              <span className="max-w-[160px] leading-tight">
                <span className="block truncate text-xs font-medium text-ink">
                  {user?.fullName}
                </span>
                <span className="block text-[10px] capitalize text-ink-3">
                  {user?.role.toLowerCase()}
                </span>
              </span>
            </NavLink>

            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-full p-2 text-ink-3 transition-colors hover:bg-lavender hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </header>

          {/* The only scrolling region. The max-width sits inside it so the
              scrollbar stays at the edge of the screen, not at the edge of the
              column. */}
          <main data-app-scroll className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">
              <InstallPrompt />
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/*
        Mobile bottom navigation.

        Cells set their height rather than using `touch-target`, whose 44px
        min-width multiplied by eight destinations exceeds a 320px screen and
        pushes the whole page sideways — which the design system does not allow
        (§11). The 44px hit height stays, and adjacent cells leave no dead space
        between them, so a narrower cell is still comfortably tappable.
      */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] font-medium',
                isActive ? 'text-violet' : 'text-ink-3',
              )
            }
          >
            {item.icon}
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        ))}
        <NavLink
          to={settingsPath}
          className={({ isActive }) =>
            cn(
              'flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] font-medium',
              isActive ? 'text-violet' : 'text-ink-3',
            )
          }
        >
          <Settings size={ICON_SIZE} />
          <span className="max-w-full truncate">More</span>
        </NavLink>
      </nav>
    </div>
  );
}
