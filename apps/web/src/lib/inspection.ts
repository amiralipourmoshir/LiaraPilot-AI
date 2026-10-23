import { z } from 'zod';
import { inspectionSchema } from '../../../../packages/shared/src/wizard';
import { api, ApiError } from './api';
type Inspection = z.infer<typeof inspectionSchema>;
export async function inspectRepository(
  input: { repositoryUrl: string; branch: string },
  csrfToken: string | undefined,
  onProgress: (events: Inspection['events']) => void,
) {
  const key = `pilot-inspection:${input.repositoryUrl}:${input.branch}`;
  const previous = sessionStorage.getItem(key);
  let state: Inspection;
  if (previous) {
    try {
      state = await api(`/repositories/inspections/${previous}`, inspectionSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        sessionStorage.removeItem(key);
        state = await api('/repositories/inspections', inspectionSchema, {
          method: 'POST',
          body: input,
          csrfToken,
        });
      } else throw error;
    }
  } else
    state = await api('/repositories/inspections', inspectionSchema, {
      method: 'POST',
      body: input,
      csrfToken,
    });
  sessionStorage.setItem(key, state.id);
  onProgress(state.events);
  while (!['SUCCEEDED', 'FAILED'].includes(state.state)) {
    // Each connection is bounded by the server; reconnect to the persisted job after disconnects.
    const response = await fetch(`/api/v1/repositories/inspections/${state.id}/events`, {
      credentials: 'same-origin',
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        'INSPECTION_STREAM_FAILED',
        'دریافت پیشرفت بررسی ممکن نشد؛ دوباره تلاش کنید.',
      );
    if (response.body) {
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (line) {
              state = inspectionSchema.parse(JSON.parse(line.slice(6)));
              onProgress(state.events);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    if (!['SUCCEEDED', 'FAILED'].includes(state.state))
      state = await api(`/repositories/inspections/${state.id}`, inspectionSchema);
  }
  sessionStorage.removeItem(key);
  if (state.error) throw new ApiError(422, state.error.code, state.error.message);
  if (!state.result) throw new Error('نتیجه بررسی در دسترس نیست.');
  return state.result;
}
