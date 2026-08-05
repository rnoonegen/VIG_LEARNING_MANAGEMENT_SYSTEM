import { useAuth } from '@/app/AuthProvider';
import { PageHeader } from '@/components/ui/Layout';
import { MomentFolderGrid } from './MomentFolderGrid';

/**
 * Moments — the staff landing page.
 *
 * You arrive at the folders, not at a wall of moments: one card per curriculum
 * subject, plus "Others" for an admin.
 *
 * There is deliberately no "New Moment" button here. A moment is always filed
 * somewhere, and the folder you are standing in is the answer to "where?" — so
 * you open a folder first and create inside it, rather than being asked the
 * question twice.
 *
 * An admin sees every folder in the school; a teacher sees the subjects they
 * were given, holding the moments they opened themselves. That split is decided
 * by the API, so this page renders whatever comes back and only changes its
 * wording.
 */
export function MomentsPage({ basePath }: { basePath: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div>
      <PageHeader
        title="Moments"
        description={
          isAdmin
            ? 'Every moment in the school, filed by subject. Open a folder to see what is inside it, or to add one.'
            : 'The moments you have created, filed under the subjects you teach. Open a folder to see what is inside it, or to add one.'
        }
      />

      <MomentFolderGrid
        basePath={basePath}
        emptyTitle={isAdmin ? 'No subjects yet' : 'No subjects assigned to you yet'}
        emptyDescription={
          isAdmin
            ? 'Moments are filed under curriculum subjects. Add a subject to the curriculum and its folder appears here.'
            : 'Once an administrator assigns you a subject, its folder appears here for you to file moments under.'
        }
      />
    </div>
  );
}




