/** Parses a user-selected dotenv document without interpolation or execution. */
export function parseEnvFile(source: string): Record<string, string> {
  if (new TextEncoder().encode(source).length > 131072)
    throw new Error('حجم فایل تنظیمات باید کمتر از ۱۲۸ کیلوبایت باشد.');
  const result: Record<string, string> = Object.create(null);
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]{1,79})\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`ساختار خط ${i + 1} فایل تنظیمات معتبر نیست.`);
    let value = match[2]!,
      quote = value[0];
    if (quote === '"' || quote === "'") {
      while (!new RegExp(`${quote}\\s*(?:#.*)?$`).test(value.slice(1)) && i + 1 < lines.length)
        value += '\n' + lines[++i];
      const end = value.lastIndexOf(quote);
      if (end === 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1)))
        throw new Error('نقل‌قول فایل تنظیمات بسته نشده است.');
      value = value.slice(1, end);
      if (quote === '"')
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
    } else value = value.replace(/\s+#.*$/, '').trim();
    if (value.length > 4096) throw new Error('یکی از مقدارهای فایل بیش از حد طولانی است.');
    if (value) result[match[1]!] = value;
  }
  if (Object.keys(result).length > 100) throw new Error('فایل تنظیمات بیشتر از ۱۰۰ متغیر دارد.');
  return result;
}
