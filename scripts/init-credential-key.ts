import { existsSync, readFileSync, appendFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) throw new Error('Create .env from .env.example first.');
const current = readFileSync('.env', 'utf8');
if (/^CREDENTIAL_KEY=.+$/m.test(current))
  console.log('Credential key already exists; no change was made.');
else {
  appendFileSync(
    '.env',
    `\nCREDENTIAL_KEY=${randomBytes(32).toString('base64')}\nCREDENTIAL_KEY_VERSION=v1\n`,
    { mode: 0o600 },
  );
  chmodSync('.env', 0o600);
  console.log('A local credential key was saved to .env. The key was not printed.');
}
