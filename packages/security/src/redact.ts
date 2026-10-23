/** Best-effort redaction of common secret formats plus exact credentials known to this request. */
export function redactSecrets(input: string, knownSecrets: readonly string[] = []): string {
  let text = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  for (const secret of knownSecrets) if (secret) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(
      /((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      '$1[REDACTED]@',
    )
    .replace(
      /(["']?(?:[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN)|API[_-]?KEY|DATABASE_URL|authorization)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    );
}
