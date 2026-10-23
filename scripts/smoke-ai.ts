import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../packages/database/src/index.js';
const db = createDatabase(process.env.DATABASE_URL!);
let userId: string | undefined;
try {
  const registration = await fetch('http://127.0.0.1:3001/api/v1/auth/register', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'آزمون اتصال مدل',
      email: `ai-smoke-${randomUUID()}@example.test`,
      password: randomUUID() + 'aA1!',
    }),
  });
  const auth = (await registration.json()) as { user?: { id: string }; csrfToken?: string };
  if (!registration.ok || !auth.user) throw new Error('SMOKE_REGISTER_FAILED');
  userId = auth.user.id;
  const cookie = registration.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  const headers = {
    origin: 'http://127.0.0.1:5173',
    'content-type': 'application/json',
    cookie,
    'x-csrf-token': auth.csrfToken!,
  };
  for (const model of ['openai/gpt-6.1-sol', 'openai/gpt-6-luna']) {
    const created = await fetch('http://127.0.0.1:3001/api/v1/conversations', {
      method: 'POST',
      headers,
      body: '{}',
    });
    const conversation = (await created.json()) as { id: string };
    const result = await fetch(
      `http://127.0.0.1:3001/api/v1/conversations/${conversation.id}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': randomUUID() },
        body: JSON.stringify({ content: 'فقط یک سلام کوتاه فارسی بنویس؛ ابزار نیاز نیست.', model }),
      },
    );
    const data = (await result.json()) as {
      model?: string;
      messages?: unknown[];
      error?: { code: string };
    };
    console.log(
      JSON.stringify({
        model,
        http: result.status,
        persistedModel: data.model,
        messages: data.messages?.length,
        errorCode: data.error?.code,
      }),
    );
  }
} finally {
  if (userId) {
    await db.conversation.deleteMany({ where: { userId } });
    await db.auditLog.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
}
