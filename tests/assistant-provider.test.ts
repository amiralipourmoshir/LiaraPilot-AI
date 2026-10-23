import { describe, expect, it } from 'vitest';
import { CompatibleModel } from '../packages/ai-agent/src/provider.js';
import {
  inspectTool,
  deploymentTool,
  deploymentToolArgsSchema,
} from '../packages/ai-agent/src/tools.js';
const config = {
  baseUrl: 'https://model.example/v1',
  key: 'sk-test-not-real-secret',
  model: 'configured-model',
  style: 'responses' as const,
  timeoutMs: 100,
};
const messages = [{ role: 'user' as const, content: 'سلام' }];
describe('bounded model transport contracts', () => {
  it('uses a supported strict-tool URL pattern rather than unsupported uri format', () => {
    const properties = deploymentTool.parameters.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties.repositoryUrl).not.toHaveProperty('format');
    expect(properties.repositoryUrl).toHaveProperty('pattern');
    expect(
      deploymentToolArgsSchema.safeParse({
        repositoryUrl: 'https://evil.example/a/b',
        applicationId: '11111111-1111-4111-8111-111111111111',
        port: 3000,
        healthPath: '/health',
        expectedText: 'healthy',
        ref: null,
      }).success,
    ).toBe(false);
  });
  it('uses Responses function tools, no storage, fixed server URL and no redirects', async () => {
    const model = new CompatibleModel(config, async (url, init) => {
      expect(url).toBe('https://model.example/v1/responses');
      expect(init?.redirect).toBe('error');
      const body = JSON.parse(init?.body as string);
      expect(body.store).toBe(false);
      expect(body.parallel_tool_calls).toBe(false);
      expect(body.tools[0].strict).toBe(true);
      expect(body.tools[0].parameters.additionalProperties).toBe(false);
      return Response.json({
        status: 'completed',
        output: [{ type: 'function_call', name: 'inspect_application', arguments: '{}' }],
      });
    });
    expect((await model.complete(messages, [inspectTool])).calls[0]?.name).toBe(
      'inspect_application',
    );
  });
  it('supports configurable Chat Completions wire contract and forced function', async () => {
    const model = new CompatibleModel({ ...config, style: 'chat' }, async (url, init) => {
      expect(String(url)).toContain('/chat/completions');
      const body = JSON.parse(init?.body as string);
      expect(body.tool_choice.function.name).toBe('inspect_application');
      return Response.json({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                { type: 'function', function: { name: 'inspect_application', arguments: '{}' } },
              ],
            },
          },
        ],
      });
    });
    expect(
      (await model.complete(messages, [inspectTool], 'inspect_application')).calls,
    ).toHaveLength(1);
  });
  it.each([401, 402, 403, 429, 503])(
    'does not leak provider body or key on HTTP %s',
    async (status) => {
      const model = new CompatibleModel(config, async () => new Response(config.key, { status }));
      try {
        await model.complete(messages, []);
        throw new Error('expected failure');
      } catch (e) {
        expect(String(e)).not.toContain(config.key);
        expect(e).toHaveProperty(
          'code',
          status === 402
            ? 'MODEL_PAYMENT_REQUIRED'
            : status === 429
              ? 'MODEL_RATE_LIMITED'
              : status < 429
                ? 'MODEL_AUTH_FAILED'
                : 'MODEL_UNAVAILABLE',
        );
      }
    },
  );
  it('rejects oversized, malformed and incomplete responses', async () => {
    for (const response of [
      new Response('x'.repeat(262145)),
      Response.json({ status: 'incomplete', output: [] }),
      new Response('not json'),
      Response.json({ choices: [] }),
    ]) {
      const model = new CompatibleModel(config, async () => response);
      await expect(model.complete(messages, [])).rejects.toThrow();
    }
  });
  it('cancels a timed out provider without an automatic retry', async () => {
    let calls = 0;
    const model = new CompatibleModel(config, async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('abort'))),
      );
    });
    await expect(model.complete(messages, [])).rejects.toHaveProperty('code', 'MODEL_TIMEOUT');
    expect(calls).toBe(1);
  });
});
