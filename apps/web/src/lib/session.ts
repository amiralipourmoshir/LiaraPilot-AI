import { useQuery } from '@tanstack/react-query';
import { sessionSchema } from '../../../../packages/shared/src/index';
import { api, ApiError } from './api';
export const sessionKey = ['session'] as const;
export function useSession(enabled = true) {
  return useQuery({
    queryKey: sessionKey,
    enabled,
    queryFn: async () => {
      try {
        return await api('/auth/session', sessionSchema);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
