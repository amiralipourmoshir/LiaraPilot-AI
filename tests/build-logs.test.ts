import { expect, it } from 'vitest';
import { LiaraClient } from '../packages/liara-adapter/src/client.js';
it('requests the pinned release build output incrementally and redacts credentials', async () => {
  const urls: string[] = [];
  const client = new LiaraClient('fixture-build-token', '', {
    fetch: async (input) => {
      urls.push(String(input));
      return Response.json({
        release: { state: 'DEPLOYING' },
        buildOutput: [
          { createdAt: '2026-10-23T18:00:00Z', line: 'Installing symfony/mime' },
          { createdAt: '2026-10-23T18:00:01Z', line: 'API_KEY=super-private fixture-build-token' },
        ],
      });
    },
  });
  const result = await client.getBuildLogs('release-test', '1');
  expect(urls[0]).toContain('/v2/releases/release-test/build-logs?since=1');
  expect(result.cursor).toBe('2026-10-23T18:00:01Z');
  expect(result.state).toBe('DEPLOYING');
  expect(JSON.stringify(result)).not.toContain('super-private');
  expect(JSON.stringify(result)).not.toContain('fixture-build-token');
  expect(result.lines[0]?.text).toBe('Installing symfony/mime');
});
