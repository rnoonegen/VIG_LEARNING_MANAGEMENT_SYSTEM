/**
 * Phase-2 AI seam — defined now, manual implementations wired.
 *
 * Nothing in this build calls a model. These interfaces exist so Phase 2 is a
 * container registration change rather than a rework: the services, controllers
 * and routes that consume them already exist and are already tested.
 *
 * See docs/DEFERRED-AI.md for the seam-by-seam inventory.
 */

import type { ClassRecordDraft, SkillStatus } from '@vig/shared';

export interface TranscriptionResult {
  transcript: string;
  language: string;
  seconds: number;
}

export interface ITranscriptionProvider {
  transcribe(audioPath: string): Promise<TranscriptionResult>;
}

export interface ExtractionInput {
  transcript: string;
  /** Present students only — absent students are stripped before the model sees them (BR-15). */
  roster: Array<{ studentId: string; fullName: string }>;
  subjectName: string;
  levelName: string;
  skills: Array<{ id: string; name: string; topicName: string }>;
  developmentAreas: Array<{ id: string; name: string }>;
  /** What the teacher typed. In Phase 2 this is the model's starting point, not its output. */
  manualDraft?: ClassRecordDraft;
}

export interface IClassNoteExtractor {
  extract(input: ExtractionInput): Promise<ClassRecordDraft>;
}

export interface SchedulingRequestDraft {
  studentIds: string[];
  subjectId: string | null;
  levelId: string | null;
  teacherId: string | null;
  timesPerWeek: number;
  durationMinutes: number;
  timePreference: 'MORNING' | 'AFTERNOON' | 'ANY';
  startDate: string;
  confident: boolean;
}

export interface ISchedulingInterpreter {
  interpret(rawText: string): Promise<SchedulingRequestDraft>;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is deferred to Phase 2. See docs/DEFERRED-AI.md.`);
    this.name = 'NotImplementedError';
  }
}
