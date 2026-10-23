import { z } from 'zod';
export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ModelTool = { name: string; description: string; parameters: Record<string, unknown> };
export type ModelReply = { text: string | null; calls: { name: string; arguments: string }[] };
export interface ModelProvider {
  complete(
    messages: ModelMessage[],
    tools: ModelTool[],
    force?: string,
    progress?: (event: { receivedBytes: number }) => Promise<void>,
  ): Promise<ModelReply>;
}
export class ModelError extends Error {
  constructor(public code: string) {
    super(
      (
        {
          MODEL_PAYMENT_REQUIRED: 'اعتبار ارائه‌دهنده مدل کافی نیست؛ موجودی حساب را بررسی کنید.',
          MODEL_RATE_LIMITED:
            'ارائه‌دهنده مدل درخواست‌های زیادی دریافت کرده است؛ کمی بعد دوباره تلاش کنید.',
          MODEL_AUTH_FAILED: 'دسترسی مدل معتبر نیست؛ کلید و مجوز اتصال مدل را بررسی کنید.',
          MODEL_NOT_AVAILABLE:
            'مدل انتخاب‌شده در اتصال فعلی در دسترس نیست؛ مدل پیش‌فرض را بررسی کنید.',
          MODEL_TIMEOUT: 'مهلت دریافت پاسخ مدل تمام شد؛ پاسخ کامل دریافت نشد.',
          MODEL_INCOMPLETE: 'پاسخ مدل به سقف خروجی رسید و ناقص ماند؛ هیچ تغییر کدی اعمال نشد.',
          MODEL_INVALID_RESPONSE: 'پاسخ ارائه‌دهنده با قرارداد ابزار سازگار نبود؛ نتیجه ثبت نشد.',
          MODEL_UNAVAILABLE:
            'ارائه‌دهنده مدل پاسخ موفق نداد؛ وضعیت اتصال و مدل انتخاب‌شده را بررسی کنید.',
        } as Record<string, string>
      )[code] ?? 'درخواست مدل کامل نشد؛ کد خطا و مرحله تایم‌لاین را بررسی کنید.',
    );
  }
}
const call = z.object({ name: z.string().max(80), arguments: z.string().max(32768) });
const chatResponse = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().max(16000).nullable().optional(),
          tool_calls: z
            .array(z.object({ type: z.literal('function'), function: call }))
            .max(1)
            .optional(),
        }),
      }),
    )
    .length(1),
});
const responsesResponse = z.object({
  status: z.literal('completed'),
  output: z.array(z.unknown()).max(30),
});
export class CompatibleModel implements ModelProvider {
  constructor(
    private config: {
      baseUrl: string;
      key: string;
      model: string;
      style: 'responses' | 'chat';
      timeoutMs: number;
      maxOutputTokens?: number;
    },
    private transport: typeof fetch = fetch,
  ) {}
  async complete(
    messages: ModelMessage[],
    tools: ModelTool[],
    force?: string,
    progress?: (event: { receivedBytes: number }) => Promise<void>,
  ): Promise<ModelReply> {
    const c = this.config;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), c.timeoutMs);
    try {
      const common = { model: c.model, store: false, parallel_tool_calls: false };
      const body =
        c.style === 'chat'
          ? {
              ...common,
              messages,
              max_completion_tokens: c.maxOutputTokens ?? 6000,
              tools: tools.map((t) => ({ type: 'function', function: { ...t, strict: true } })),
              tool_choice: force ? { type: 'function', function: { name: force } } : 'auto',
            }
          : {
              ...common,
              input: messages,
              max_output_tokens: c.maxOutputTokens ?? 6000,
              tools: tools.map((t) => ({ type: 'function', ...t, strict: true })),
              tool_choice: force ? { type: 'function', name: force } : 'auto',
            };
      const response = await this.transport(
        `${c.baseUrl.replace(/\/$/, '')}/${c.style === 'chat' ? 'chat/completions' : 'responses'}`,
        {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { authorization: `Bearer ${c.key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const raw = await response.text().catch(() => '');
        const unavailable =
          /model.*(?:not found|not exist|unavailable)|invalid.model|model_not_found/i.test(raw);
        throw new ModelError(
          response.status === 402
            ? 'MODEL_PAYMENT_REQUIRED'
            : response.status === 429
              ? 'MODEL_RATE_LIMITED'
              : response.status === 401 || response.status === 403
                ? 'MODEL_AUTH_FAILED'
                : unavailable
                  ? 'MODEL_NOT_AVAILABLE'
                  : 'MODEL_UNAVAILABLE',
        );
      }
      if (!response.body) throw new ModelError('MODEL_INVALID_RESPONSE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          await progress?.({ receivedBytes: size });
          if (size > 262144) {
            await reader.cancel();
            throw new ModelError('MODEL_RESPONSE_TOO_LARGE');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (c.style === 'chat') {
        const result = chatResponse.parse(raw).choices[0]!;
        if (!['stop', 'tool_calls'].includes(result.finish_reason))
          throw new ModelError('MODEL_INCOMPLETE');
        return {
          text: result.message.content ?? null,
          calls: result.message.tool_calls?.map((t) => t.function) ?? [],
        };
      }
      const result = responsesResponse.parse(raw);
      const calls: ModelReply['calls'] = [];
      const texts: string[] = [];
      for (const item of result.output) {
        const typed = z.object({ type: z.string() }).parse(item);
        if (typed.type === 'function_call') calls.push(call.parse(item));
        else if (typed.type === 'message') {
          const message = z
            .object({
              content: z
                .array(z.object({ type: z.string(), text: z.string().max(16000).optional() }))
                .max(10),
            })
            .parse(item);
          for (const part of message.content)
            if (part.type === 'output_text' && part.text) texts.push(part.text);
        } else if (typed.type !== 'reasoning') throw new ModelError('MODEL_INVALID_RESPONSE');
      }
      if (calls.length > 1 || texts.join('\n').length > 16000)
        throw new ModelError('MODEL_INVALID_RESPONSE');
      return { text: texts.join('\n') || null, calls };
    } catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError(controller.signal.aborted ? 'MODEL_TIMEOUT' : 'MODEL_INVALID_RESPONSE');
    } finally {
      clearTimeout(timer);
    }
  }
}
