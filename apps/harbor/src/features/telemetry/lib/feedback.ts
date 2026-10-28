import { type LogEntry, useLogStore } from '../hooks/useLogStore';
import {
  type Feedback,
  MAX_FEEDBACK_LOG_LINES,
  flushTraces,
  getTracer,
  recordFeedbackSpan,
} from './tracing';

export const MAX_FEEDBACK_LENGTH = 5000;
const FEEDBACK_FLUSH_TIMEOUT_MS = 10_000;

export interface FeedbackInput {
  message: string;
  email: string;
  identityKey: string | null;
  signingKey?: string | null;
  includeIdentity: boolean;
  includeLogs: boolean;
  logs?: LogEntry[];
}

export function buildFeedback(input: FeedbackInput): Feedback {
  const email = input.email.trim();
  const feedback: Feedback = {
    message: input.message.trim().slice(0, MAX_FEEDBACK_LENGTH),
  };
  if (email) feedback.email = email;
  if (input.includeIdentity && input.identityKey) {
    feedback.identityKey = input.identityKey;
    if (input.signingKey) feedback.signingKey = input.signingKey;
  }
  if (input.includeLogs) {
    feedback.logs = (input.logs ?? useLogStore.getState().entries).slice(
      -MAX_FEEDBACK_LOG_LINES,
    );
  }
  return feedback;
}

/** Resolves true once the feedback has been delivered to the collector. */
export async function sendFeedback(feedback: Feedback): Promise<boolean> {
  const tracer = getTracer();
  if (!tracer || !feedback.message) return false;
  recordFeedbackSpan(tracer, feedback);
  return flushTraces(FEEDBACK_FLUSH_TIMEOUT_MS);
}
