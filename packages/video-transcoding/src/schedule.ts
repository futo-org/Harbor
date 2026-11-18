import type { ScheduledFrame, SourceFrameInfo } from './types';

/**
 * Computes the desired output video frame schedule by reading input file headers, before encoding
 * runs.
 */
export function buildFrameSchedule(
  _frames: SourceFrameInfo[],
  _maxFps: number,
): ScheduledFrame[] {
  throw new Error('buildFrameSchedule: not implemented');
}
