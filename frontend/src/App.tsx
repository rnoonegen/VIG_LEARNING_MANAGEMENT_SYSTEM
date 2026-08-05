import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '@vig/shared';
import { homeRouteFor, useAuth } from './app/AuthProvider';
import { ADMIN_NAV, PARENT_NAV, Shell, TEACHER_NAV } from './layouts/Shell';
import { LoadingState } from './components/ui/States';

import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { ProfileSettingsPage } from './pages/settings/ProfileSettingsPage';
import { NotificationSettingsPage } from './pages/settings/NotificationSettingsPage';
import { SecuritySettingsPage } from './pages/settings/SecuritySettingsPage';
import { AccountsSettingsPage } from './pages/settings/AccountsSettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';

import { AdminHomePage } from './pages/admin/AdminHomePage';
import { AdminCurriculumPage, TeacherCurriculumPage } from './pages/curriculum/CurriculumTree';
import { TeachersPage } from './pages/admin/teachers/TeachersPage';
import { AddTeacherPage } from './pages/admin/teachers/AddTeacherPage';
import { TeacherAttendancePage } from './pages/admin/teachers/TeacherAttendancePage';
import { TeacherProfilePage } from './pages/admin/teachers/TeacherProfilePage';
import { StudentsPage } from './pages/students/StudentsPage';
import { StudentProfilePage } from './pages/students/StudentProfilePage';
import { AddStudentPage } from './pages/admin/students/AddStudentPage';
import { ParentsPage } from './pages/admin/parents/ParentsPage';
import { AddParentPage } from './pages/admin/parents/AddParentPage';
import { ParentProfilePage } from './pages/admin/parents/ParentProfilePage';
import { SchedulePage } from './pages/admin/schedule/SchedulePage';
import { AddClassPage } from './pages/admin/schedule/AddClassPage';
import { ReschedulePage } from './pages/admin/schedule/ReschedulePage';
import { WeeklyUpdatesPage } from './pages/admin/WeeklyUpdatesPage';

import { TeacherHomePage } from './pages/teacher/TeacherHomePage';
import { TeacherSchedulePage } from './pages/teacher/TeacherSchedulePage';
import { TeacherAvailabilityPage } from './pages/teacher/TeacherAvailabilityPage';
import { ClassRecordPage } from './pages/teacher/ClassRecordPage';
import { ClassProgressPage } from './pages/teacher/ClassProgressPage';

import { MomentsPage } from './pages/moments/MomentsPage';
import { MomentFolderPage } from './pages/moments/MomentFolderPage';
import { MomentDetailPage } from './pages/moments/MomentDetailPage';

import { ParentHomePage } from './pages/parent/ParentHomePage';
import { ParentLearningPage } from './pages/parent/ParentLearningPage';
import { ParentDevelopmentPage } from './pages/parent/ParentDevelopmentPage';
import { ParentMomentFolderPage, ParentMomentsPage } from './pages/parent/ParentMomentsPage';
import { WeeklyUpdatePage } from './pages/parent/WeeklyUpdatePage';

/**
 * Route gating is a convenience, not the security boundary — every endpoint
 * authorises server-side regardless of what the client renders.
 */
function Protected({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadingState rows={4} label="Checking your session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // A temporary password must be replaced before anything else is reachable.
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeRouteFor(user)} replace />;

  return <>{children}</>;
}

/**
 * Accounts lives under Settings but is the admin's alone. The settings shell is
 * shared by all three roles, so the guard is on the section rather than on the
 * branch of the route tree.
 */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && user.role !== 'ADMIN') return <Navigate to="/settings/profile" replace />;
  return <>{children}</>;
}

/** The old Accounts path, kept alive for links already sent out. */
function AccountsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/settings/accounts${search}`} replace />;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState rows={3} />;
  return <Navigate to={user ? homeRouteFor(user) : '/login'} replace />;
}

/** Settings and notifications are shared, so the shell follows the caller's role. */
function RoleShell() {
  const { user } = useAuth();
  const nav = user?.role === 'TEACHER' ? TEACHER_NAV : user?.role === 'PARENT' ? PARENT_NAV : ADMIN_NAV;
  return <Shell nav={nav} settingsPath="/settings" />;
}

export function App() {
  return (
    <Routes>
      {/* --- Public --- */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* --- Admin --- */}
      <Route
        element={
          <Protected roles={['ADMIN']}>
            <Shell nav={ADMIN_NAV} settingsPath="/settings" />
          </Protected>
        }
      >
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/admin/curriculum" element={<AdminCurriculumPage />} />
        <Route path="/admin/teachers" element={<TeachersPage />} />
        <Route path="/admin/teachers/new" element={<AddTeacherPage />} />
        <Route path="/admin/teachers/attendance" element={<TeacherAttendancePage />} />
        <Route path="/admin/teachers/:teacherId" element={<TeacherProfilePage />} />
        <Route path="/admin/students" element={<StudentsPage basePath="/admin/students" canManage />} />
        <Route path="/admin/students/new" element={<AddStudentPage />} />
        <Route path="/admin/students/:studentId" element={<StudentProfilePage basePath="/admin/students" canManage />} />
        <Route path="/admin/parents" element={<ParentsPage />} />
        <Route path="/admin/parents/new" element={<AddParentPage />} />
        <Route path="/admin/parents/:parentId" element={<ParentProfilePage />} />
        <Route path="/admin/schedule" element={<SchedulePage />} />
        <Route path="/admin/schedule/new" element={<AddClassPage />} />
        <Route path="/admin/schedule/reschedule" element={<ReschedulePage />} />
        <Route path="/admin/weekly-updates" element={<WeeklyUpdatesPage />} />
        {/* Accounts moved under Settings. Notifications already sent carry the
            old link, so it keeps working — with the ?reset= id intact. */}
        <Route path="/admin/users" element={<AccountsRedirect />} />
        {/* Moments open as folders. The static /f/ segment keeps a folder id —
            which may be the word "others" — out of the moment-id route. */}
        <Route path="/admin/moments" element={<MomentsPage basePath="/admin/moments" />} />
        <Route path="/admin/moments/f/:folderId" element={<MomentFolderPage basePath="/admin/moments" />} />
        <Route path="/admin/moments/:momentId" element={<MomentDetailPage basePath="/admin/moments" />} />
      </Route>

      {/* --- Teacher --- */}
      <Route
        element={
          <Protected roles={['TEACHER']}>
            <Shell nav={TEACHER_NAV} settingsPath="/settings" />
          </Protected>
        }
      >
        <Route path="/teacher" element={<TeacherHomePage />} />
        <Route path="/teacher/schedule" element={<TeacherSchedulePage />} />
        <Route path="/teacher/availability" element={<TeacherAvailabilityPage />} />
        <Route path="/teacher/students" element={<StudentsPage basePath="/teacher/students" />} />
        <Route path="/teacher/students/:studentId" element={<StudentProfilePage basePath="/teacher/students" />} />
        <Route path="/teacher/curriculum" element={<TeacherCurriculumPage />} />
        <Route path="/teacher/class/:occurrenceId/progress" element={<ClassProgressPage />} />
        <Route path="/teacher/moments" element={<MomentsPage basePath="/teacher/moments" />} />
        <Route path="/teacher/moments/f/:folderId" element={<MomentFolderPage basePath="/teacher/moments" />} />
        <Route path="/teacher/moments/:momentId" element={<MomentDetailPage basePath="/teacher/moments" />} />
      </Route>

      {/* The class-record flow is full-screen: a stepper should not compete
          with navigation while a teacher is documenting a class. */}
      <Route
        path="/teacher/class/:occurrenceId"
        element={
          <Protected roles={['TEACHER', 'ADMIN']}>
            <ClassRecordPage />
          </Protected>
        }
      />

      {/* --- Parent --- */}
      <Route
        element={
          <Protected roles={['PARENT']}>
            <Shell nav={PARENT_NAV} settingsPath="/settings" />
          </Protected>
        }
      >
        <Route path="/parent" element={<ParentHomePage />} />
        <Route path="/parent/learning" element={<ParentLearningPage />} />
        <Route path="/parent/development" element={<ParentDevelopmentPage />} />
        <Route path="/parent/moments" element={<ParentMomentsPage />} />
        <Route path="/parent/moments/f/:folderId" element={<ParentMomentFolderPage />} />
        <Route path="/parent/moments/:momentId" element={<MomentDetailPage basePath="/parent/moments" />} />
        <Route path="/parent/weekly-updates/:updateId" element={<WeeklyUpdatePage />} />
      </Route>

      {/* --- Shared, any signed-in role --- */}
      <Route
        element={
          <Protected roles={['ADMIN', 'TEACHER', 'PARENT']}>
            <RoleShell />
          </Protected>
        }
      >
        {/* Settings is a place with sections, each its own route so it can be
            linked to — Accounts is, from the password-reset notification. */}
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/profile" replace />} />
          <Route path="profile" element={<ProfileSettingsPage />} />
          <Route path="notifications" element={<NotificationSettingsPage />} />
          <Route path="security" element={<SecuritySettingsPage />} />
          <Route path="accounts" element={<AdminOnly><AccountsSettingsPage /></AdminOnly>} />
        </Route>
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
