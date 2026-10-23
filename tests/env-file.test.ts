import { expect, it } from 'vitest';
import { parseEnvFile } from '../packages/shared/src/env-file.js';
it('imports dotenv values with comments, quotes and multiline keys without executing interpolation', () => {
  const env = parseEnvFile(
    '# configuration\nexport APP_NAME="My app"\nAPP_KEY=base64:abc==\nAPP_PREVIOUS_KEYS=\nDB_PASSWORD="a#b" # comment\nPRIVATE_KEY="first\nsecond"\nLITERAL=${APP_NAME}\n',
  );
  expect({ ...env }).toEqual({
    APP_NAME: 'My app',
    APP_KEY: 'base64:abc==',
    DB_PASSWORD: 'a#b',
    PRIVATE_KEY: 'first\nsecond',
    LITERAL: '${APP_NAME}',
  });
});
it('rejects malformed or oversized files without putting their values in errors', () => {
  expect(() => parseEnvFile('a secret malformed line')).toThrow('ساختار خط 1');
  expect(() => parseEnvFile('APP_KEY="not closed')).toThrow('نقل‌قول');
  expect(() => parseEnvFile('X'.repeat(131073))).toThrow('حجم فایل');
  expect(() => parseEnvFile('APP_KEY=' + 'x'.repeat(4097))).toThrow('طولانی');
});
