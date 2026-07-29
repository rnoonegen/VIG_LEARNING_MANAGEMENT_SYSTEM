-- ============================================================================
-- 011 — Foreign keys
--
-- Kept in one file, applied after every table exists, so the 39 CREATE TABLE statements have no ordering dependency between files.
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_fkey";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teachers" DROP CONSTRAINT IF EXISTS "teachers_user_id_fkey";
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parents" DROP CONSTRAINT IF EXISTS "parents_user_id_fkey";
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parent_students" DROP CONSTRAINT IF EXISTS "parent_students_parent_id_fkey";
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parent_students" DROP CONSTRAINT IF EXISTS "parent_students_student_id_fkey";
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "levels" DROP CONSTRAINT IF EXISTS "levels_subject_id_fkey";
ALTER TABLE "levels" ADD CONSTRAINT "levels_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topics" DROP CONSTRAINT IF EXISTS "topics_level_id_fkey";
ALTER TABLE "topics" ADD CONSTRAINT "topics_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "skills_topic_id_fkey";
ALTER TABLE "skills" ADD CONSTRAINT "skills_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_capabilities" DROP CONSTRAINT IF EXISTS "teacher_capabilities_teacher_id_fkey";
ALTER TABLE "teacher_capabilities" ADD CONSTRAINT "teacher_capabilities_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_capabilities" DROP CONSTRAINT IF EXISTS "teacher_capabilities_subject_id_fkey";
ALTER TABLE "teacher_capabilities" ADD CONSTRAINT "teacher_capabilities_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_availability" DROP CONSTRAINT IF EXISTS "teacher_availability_teacher_id_fkey";
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_availability_exceptions" DROP CONSTRAINT IF EXISTS "teacher_availability_exceptions_teacher_id_fkey";
ALTER TABLE "teacher_availability_exceptions" ADD CONSTRAINT "teacher_availability_exceptions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_availability" DROP CONSTRAINT IF EXISTS "student_availability_student_id_fkey";
ALTER TABLE "student_availability" ADD CONSTRAINT "student_availability_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_subject_levels" DROP CONSTRAINT IF EXISTS "student_subject_levels_student_id_fkey";
ALTER TABLE "student_subject_levels" ADD CONSTRAINT "student_subject_levels_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_subject_levels" DROP CONSTRAINT IF EXISTS "student_subject_levels_subject_id_fkey";
ALTER TABLE "student_subject_levels" ADD CONSTRAINT "student_subject_levels_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_subject_levels" DROP CONSTRAINT IF EXISTS "student_subject_levels_level_id_fkey";
ALTER TABLE "student_subject_levels" ADD CONSTRAINT "student_subject_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_skill_progress" DROP CONSTRAINT IF EXISTS "student_skill_progress_student_id_fkey";
ALTER TABLE "student_skill_progress" ADD CONSTRAINT "student_skill_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_skill_progress" DROP CONSTRAINT IF EXISTS "student_skill_progress_skill_id_fkey";
ALTER TABLE "student_skill_progress" ADD CONSTRAINT "student_skill_progress_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_updates" DROP CONSTRAINT IF EXISTS "learning_updates_student_id_fkey";
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_updates" DROP CONSTRAINT IF EXISTS "learning_updates_skill_id_fkey";
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_updates" DROP CONSTRAINT IF EXISTS "learning_updates_class_record_id_fkey";
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_class_record_id_fkey" FOREIGN KEY ("class_record_id") REFERENCES "class_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_updates" DROP CONSTRAINT IF EXISTS "learning_updates_author_id_fkey";
ALTER TABLE "learning_updates" ADD CONSTRAINT "learning_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "level_completions" DROP CONSTRAINT IF EXISTS "level_completions_student_id_fkey";
ALTER TABLE "level_completions" ADD CONSTRAINT "level_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "level_completions" DROP CONSTRAINT IF EXISTS "level_completions_subject_id_fkey";
ALTER TABLE "level_completions" ADD CONSTRAINT "level_completions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "level_completions" DROP CONSTRAINT IF EXISTS "level_completions_from_level_id_fkey";
ALTER TABLE "level_completions" ADD CONSTRAINT "level_completions_from_level_id_fkey" FOREIGN KEY ("from_level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "level_completions" DROP CONSTRAINT IF EXISTS "level_completions_to_level_id_fkey";
ALTER TABLE "level_completions" ADD CONSTRAINT "level_completions_to_level_id_fkey" FOREIGN KEY ("to_level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_subject_id_fkey";
ALTER TABLE "classes" ADD CONSTRAINT "classes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_level_id_fkey";
ALTER TABLE "classes" ADD CONSTRAINT "classes_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_teacher_id_fkey";
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_students" DROP CONSTRAINT IF EXISTS "class_students_class_id_fkey";
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_students" DROP CONSTRAINT IF EXISTS "class_students_student_id_fkey";
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_occurrences" DROP CONSTRAINT IF EXISTS "class_occurrences_class_id_fkey";
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_occurrences" DROP CONSTRAINT IF EXISTS "class_occurrences_teacher_id_fkey";
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_occurrence_id_fkey";
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "class_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_student_id_fkey";
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_change_proposals" DROP CONSTRAINT IF EXISTS "schedule_change_proposals_request_id_fkey";
ALTER TABLE "schedule_change_proposals" ADD CONSTRAINT "schedule_change_proposals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "scheduling_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "class_records" DROP CONSTRAINT IF EXISTS "class_records_occurrence_id_fkey";
ALTER TABLE "class_records" ADD CONSTRAINT "class_records_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "class_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_records" DROP CONSTRAINT IF EXISTS "class_records_author_id_fkey";
ALTER TABLE "class_records" ADD CONSTRAINT "class_records_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_observations" DROP CONSTRAINT IF EXISTS "student_observations_class_record_id_fkey";
ALTER TABLE "student_observations" ADD CONSTRAINT "student_observations_class_record_id_fkey" FOREIGN KEY ("class_record_id") REFERENCES "class_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_observations" DROP CONSTRAINT IF EXISTS "student_observations_student_id_fkey";
ALTER TABLE "student_observations" ADD CONSTRAINT "student_observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_development_areas" DROP CONSTRAINT IF EXISTS "student_development_areas_student_id_fkey";
ALTER TABLE "student_development_areas" ADD CONSTRAINT "student_development_areas_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_development_areas" DROP CONSTRAINT IF EXISTS "student_development_areas_area_id_fkey";
ALTER TABLE "student_development_areas" ADD CONSTRAINT "student_development_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "development_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_observations" DROP CONSTRAINT IF EXISTS "development_observations_student_id_fkey";
ALTER TABLE "development_observations" ADD CONSTRAINT "development_observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_observations" DROP CONSTRAINT IF EXISTS "development_observations_area_id_fkey";
ALTER TABLE "development_observations" ADD CONSTRAINT "development_observations_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "development_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_observations" DROP CONSTRAINT IF EXISTS "development_observations_observer_id_fkey";
ALTER TABLE "development_observations" ADD CONSTRAINT "development_observations_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "development_observations" DROP CONSTRAINT IF EXISTS "development_observations_class_record_id_fkey";
ALTER TABLE "development_observations" ADD CONSTRAINT "development_observations_class_record_id_fkey" FOREIGN KEY ("class_record_id") REFERENCES "class_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "development_stage_changes" DROP CONSTRAINT IF EXISTS "development_stage_changes_student_id_fkey";
ALTER TABLE "development_stage_changes" ADD CONSTRAINT "development_stage_changes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_stage_changes" DROP CONSTRAINT IF EXISTS "development_stage_changes_area_id_fkey";
ALTER TABLE "development_stage_changes" ADD CONSTRAINT "development_stage_changes_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "development_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moments" DROP CONSTRAINT IF EXISTS "moments_subject_id_fkey";
ALTER TABLE "moments" ADD CONSTRAINT "moments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moments" DROP CONSTRAINT IF EXISTS "moments_class_occurrence_id_fkey";
ALTER TABLE "moments" ADD CONSTRAINT "moments_class_occurrence_id_fkey" FOREIGN KEY ("class_occurrence_id") REFERENCES "class_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moments" DROP CONSTRAINT IF EXISTS "moments_created_by_fkey";
ALTER TABLE "moments" ADD CONSTRAINT "moments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moment_media" DROP CONSTRAINT IF EXISTS "moment_media_moment_id_fkey";
ALTER TABLE "moment_media" ADD CONSTRAINT "moment_media_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_students" DROP CONSTRAINT IF EXISTS "moment_students_moment_id_fkey";
ALTER TABLE "moment_students" ADD CONSTRAINT "moment_students_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_students" DROP CONSTRAINT IF EXISTS "moment_students_student_id_fkey";
ALTER TABLE "moment_students" ADD CONSTRAINT "moment_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "weekly_updates" DROP CONSTRAINT IF EXISTS "weekly_updates_student_id_fkey";
ALTER TABLE "weekly_updates" ADD CONSTRAINT "weekly_updates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "weekly_update_items" DROP CONSTRAINT IF EXISTS "weekly_update_items_weekly_update_id_fkey";
ALTER TABLE "weekly_update_items" ADD CONSTRAINT "weekly_update_items_weekly_update_id_fkey" FOREIGN KEY ("weekly_update_id") REFERENCES "weekly_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_recipient_user_id_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_actor_id_fkey";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
