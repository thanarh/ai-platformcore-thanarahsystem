'use client';
import { cn } from '@/lib/utils';

const V = '?v=2'; // bump this whenever logo files are replaced

// Icon-only — the 4-petal cross mark
export function ThanarahIcon({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/thanarah-icon.png${V}`}
      alt="Thanarah AI"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      className={className}
    />
  );
}

// Full horizontal logo — icon + ثناره + THANARAH AI
export function ThanarahLogoFull({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const heights: Record<string, number> = { sm: 36, md: 52, lg: 72 };
  const h = heights[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/thanarah-logo.png${V}`}
      alt="Thanarah AI"
      height={h}
      style={{ height: h, width: 'auto', objectFit: 'contain', display: 'block' }}
      className={cn(className)}
    />
  );
}

export default ThanarahLogoFull;
