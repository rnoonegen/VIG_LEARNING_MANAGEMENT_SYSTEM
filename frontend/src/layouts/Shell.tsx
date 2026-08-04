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
import type { NotificationDto } from '@vig/shared';
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

function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const items = await get<NotificationDto[]>('/notifications');
      return items.filter((n) => !n.readAt).length;
    },
    refetchInterval: 60_000,
  });
  return data ?? 0;
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
    <div className="min-h-screen bg-canvas">
      <OfflineBanner />

      <div className="flex">
        {/* Desktop left rail */}
        <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-card px-4 py-5 md:flex">
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

            <div className="mt-2 flex items-center gap-2.5 rounded-[12px] px-2 py-2">
              <Avatar name={user?.fullName ?? ''} url={user?.avatarUrl} size={32} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-medium text-ink">{user?.fullName}</span>
                <span className="block text-[10px] capitalize text-ink-3">
                  {user?.role.toLowerCase()}
                </span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="rounded-full p-2 text-ink-3 hover:bg-lavender hover:text-danger"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
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

          {/* Desktop top bar */}
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b border-line bg-canvas/80 px-8 py-3 backdrop-blur md:flex">
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
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">
            <InstallPrompt />
            <Outlet />
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
