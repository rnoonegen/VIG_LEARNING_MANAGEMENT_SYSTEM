import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from '@vig/shared';
import { homeRouteFor, useAuth } from './app/AuthProvider';
import { ADMIN_NAV, PARENT_NAV, Shell, TEACHER_NAV } from './layouts/Shell';
import { LoadingState } from './components/ui/States';

import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';

import { AdminHomePage } from './pages/admin/AdminHomePage';
import { AdminCurriculumPage, TeacherCurriculumPage } from './pages/curriculum/CurriculumTree';
import { TeachersPage } from './pages/admin/teachers/TeachersPage';
import { AddTeacherPage } from './pages/admin/teachers/AddTeacherPage';
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
import { UsersPage } from './pages/admin/UsersPage';

import { TeacherHomePage } from './pages/teacher/TeacherHomePage';
import { TeacherSchedulePage } from './pages/teacher/TeacherSchedulePage';
import { TeacherAvailabilityPage } from './pages/teacher/TeacherAvailabilityPage';
import { ClassRecordPage } from './pages/teacher/ClassRecordPage';
import { ClassProgressPage } from './pages/teacher/ClassProgressPage';

import { MomentsPage } from './pages/moments/MomentsPage';

import { ParentHomePage } from './pages/parent/ParentHomePage';
import { ParentLearningPage } from './pages/parent/ParentLearningPage';
import { ParentDevelopmentPage } from './pages/parent/ParentDevelopmentPage';
import { ParentMomentsPage } from './pages/parent/ParentMomentsPage';
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
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/moments" element={<MomentsPage />} />
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
        <Route path="/teacher/moments" element={<MomentsPage />} />
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
