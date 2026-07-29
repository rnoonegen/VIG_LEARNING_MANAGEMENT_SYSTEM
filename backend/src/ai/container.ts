import {
  NotImplementedError,
  type ExtractionInput,
  type IClassNoteExtractor,
  type ISchedulingInterpreter,
  type ITranscriptionProvider,
  type SchedulingRequestDraft,
  type TranscriptionResult,
} from './contracts.js';
import type { ClassRecordDraft } from '@vig/shared';

/**
 * Returns the teacher's typed payload unchanged. The review-and-approve UI and
 * the atomic save path are identical whether a human or a model produced the
 * draft, which is the point of the seam (docs/DEFERRED-AI.md §2.2).
 */
class ManualClassNoteExtractor implements IClassNoteExtractor {
  async extract(input: ExtractionInput): Promise<ClassRecordDraft> {
    if (!input.manualDraft) {
      throw new NotImplementedError('Automatic class-note extraction');
    }
    return input.manualDraft;
  }
}

/** No route reaches these in this build; they exist so the container is complete. */
class NoopTranscriptionProvider implements ITranscriptionProvider {
  async transcribe(): Promise<TranscriptionResult> {
    throw new NotImplementedError('Voice transcription');
  }
}

class NoopSchedulingInterpreter implements ISchedulingInterpreter {
  async interpret(): Promise<SchedulingRequestDraft> {
    throw new NotImplementedError('Natural-language scheduling');
  }
}

/**
 * The DI container. Phase 2 swaps these three registrations for
 * WhisperTranscriptionProvider / ClaudeClassNoteExtractor / ClaudeSchedulingInterpreter.
 * No service, controller or route changes.
 */
export const container = {
  transcription: new NoopTranscriptionProvider() as ITranscriptionProvider,
  classNoteExtractor: new ManualClassNoteExtractor() as IClassNoteExtractor,
  schedulingInterpreter: new NoopSchedulingInterpreter() as ISchedulingInterpreter,
};
