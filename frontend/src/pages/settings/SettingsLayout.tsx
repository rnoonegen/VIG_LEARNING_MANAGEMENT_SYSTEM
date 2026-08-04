import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { cn } from '@/lib/ui';
import { PageHeader } from '@/components/ui/Layout';

/**
 * Settings, as a place rather than a page.
 *
 * The single scrolling page this replaces put a teacher's phone number, their
 * push permissions and the admin's account list in one column, which meant the
 * one thing somebody came for was never where they looked. Each heading is now
 * its own route: linkable, and short enough to read without scrolling.
 *
 * Accounts is admin-only and is where a forgotten password ends up — the
 * notification an admin gets links straight into it.
 */

interface SettingsSection {
  to: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const ICON_SIZE = 17;

const SECTIONS: SettingsSection[] = [
  { to: '/settings/profile', label: 'Profile', icon: <UserRound size={ICON_SIZE} /> },
  { to: '/settings/notifications', label: 'Notifications', icon: <Bell size={ICON_SIZE} /> },
  { to: '/settings/security', label: 'Security', icon: <ShieldCheck size={ICON_SIZE} /> },
  { to: '/settings/accounts', label: 'Accounts', icon: <KeyRound size={ICON_SIZE} />, adminOnly: true },
];

export function SettingsLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const sections = SECTIONS.filter((s) => !s.adminOnly || user?.role === 'ADMIN');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, how you are notified, and your password." />

      {/* Side by side on desktop; on mobile the list sits above the panel and
          scrolls sideways, so the current section stays visible. */}
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <nav className="scroll-x -mx-1 shrink-0 px-1 md:w-[210px] md:overflow-visible">
          <div className="flex min-w-max gap-1 md:min-w-0 md:flex-col">
            {sections.map((section) => (
              <NavLink
                key={section.to}
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-lavender text-violet' : 'text-ink-2 hover:bg-lavender-2 hover:text-ink',
                  )
                }
              >
                {section.icon}
                {section.label}
              </NavLink>
            ))}

            {/* Not a section — an action, so it is styled as one and kept last. */}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-[12px] px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-danger-bg hover:text-danger md:mt-2 md:border-t md:border-line md:pt-4"
            >
              <LogOut size={ICON_SIZE} />
              Log out
            </button>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
