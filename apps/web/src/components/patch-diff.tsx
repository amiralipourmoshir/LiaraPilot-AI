import { useMemo } from 'react';
import { FileCode2 } from 'lucide-react';

export function PatchDiff({
  patch,
  path,
  applied = false,
}: {
  patch: string;
  path?: string;
  applied?: boolean;
}) {
  const rows = useMemo(() => {
    let oldLine = 0,
      newLine = 0;
    let inHunk = false;
    const lines = patch.split('\n');
    return lines.flatMap((text, index) => {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (hunk) {
        inHunk = true;
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        return [{ index, text, kind: 'hunk', old: '', next: '' }];
      }
      if (
        (!inHunk && (text.startsWith('--- ') || text.startsWith('+++ '))) ||
        text.startsWith('Index:') ||
        /^=+$/.test(text) ||
        (!text && index === lines.length - 1)
      )
        return [];
      const kind = text.startsWith('+')
        ? 'add'
        : text.startsWith('-')
          ? 'remove'
          : text.startsWith(' ')
            ? 'context'
            : 'meta';
      return [
        {
          index,
          text,
          kind,
          old: kind === 'remove' || kind === 'context' ? String(oldLine++) : '',
          next: kind === 'add' || kind === 'context' ? String(newLine++) : '',
        },
      ];
    });
  }, [patch]);
  const added = rows.filter((r) => r.kind === 'add').length;
  const removed = rows.filter((r) => r.kind === 'remove').length;
  return (
    <section
      className="patch-viewer"
      aria-label={applied ? 'تفاوت کد پچ اعمال‌شده' : 'تفاوت کد پیشنهادی'}
    >
      <header className="patch-viewer-header">
        <span>
          <FileCode2 size={16} />
          <bdi>{path ?? 'تغییرات فایل'}</bdi>
        </span>
        <div>
          <span className="diff-count-add">+{added}</span>
          <span className="diff-count-remove">−{removed}</span>
        </div>
      </header>
      <div className="patch-viewer-scroll" dir="ltr" tabIndex={0} aria-label="خطوط تغییرات کد">
        <table className="patch-diff-table">
          <thead className="sr-only">
            <tr>
              <th>خط قبل</th>
              <th>خط بعد</th>
              <th>کد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} className={`diff-${row.kind}`}>
                <td className="diff-line-number">{row.old}</td>
                <td className="diff-line-number">{row.next}</td>
                <td className="diff-source">
                  <code>{row.text || ' '}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer>سبز: اضافه‌شده · قرمز: حذف‌شده · شماره خطوط: قبل / بعد</footer>
    </section>
  );
}
