import type { CSSProperties } from 'react';
import { Code2, Check, Boxes } from 'lucide-react';
import { getPlatform, platforms } from '../../../../packages/shared/src/platforms';
export function PlatformMark({
  platform,
  size = 42,
  label = false,
}: {
  platform?: string | null;
  size?: number;
  label?: boolean;
}) {
  const data = getPlatform(platform);
  return (
    <span
      className={`platform-identity ${label ? 'with-label' : ''}`}
      style={{ '--platform-color': data?.color ?? 'var(--accent)' } as CSSProperties}
    >
      {size > 0 && (
        <span className="platform-art" style={{ width: size, height: size }}>
          {data ? (
            <img
              src={`/platforms/${data.id}.png`}
              alt=""
              aria-hidden="true"
              width={275}
              height={275}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Code2 size={size * 0.5} />
          )}
        </span>
      )}
      {label && <bdi>{data?.name ?? platform ?? 'نوع پروژه نامشخص'}</bdi>}
    </span>
  );
}
export function PlatformGallery({ detected }: { detected?: string | null }) {
  const chosen = getPlatform(detected);
  return (
    <section className="platform-gallery">
      <div className="platform-gallery-heading">
        <span>
          <Boxes size={17} />
          پلتفرم‌های قابل پشتیبانی
        </span>
        <small>تشخیص بر اساس فایل‌های پروژه</small>
      </div>
      <div className="platform-gallery-grid">
        {platforms.map((p) => (
          <div
            key={p.id}
            className={`platform-gallery-card ${p.id === chosen?.id ? 'is-detected' : ''}`}
            title={p.description}
          >
            <PlatformMark platform={p.id} size={62} />
            <bdi>{p.name}</bdi>
            {p.id === chosen?.id && (
              <span className="platform-detected-check">
                <Check size={12} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
