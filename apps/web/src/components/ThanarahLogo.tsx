'use client';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ThanarahLogoProps {
  variant?: 'full' | 'icon' | 'text';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  darkText?: boolean;
}

// Inline SVG logo components that match the Thanarah brand
// (Using inline SVG since the actual logo files are in attached_assets)

export function ThanarahIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cross/plus shape with rounded petals — matches Thanarah logo mark */}
      {/* Top petal — dark green */}
      <ellipse cx="50" cy="28" rx="14" ry="22" fill="#1a5f3f" transform="rotate(0 50 50)" />
      {/* Left petal — dark green */}
      <ellipse cx="28" cy="50" rx="22" ry="14" fill="#1a5f3f" />
      {/* Bottom-right petal — sage/light green */}
      <ellipse cx="72" cy="72" rx="18" ry="14" fill="#9dbfad" transform="rotate(45 72 72)" />
      {/* Bottom-left petal — sage/light green */}
      <ellipse cx="50" cy="76" rx="14" ry="18" fill="#9dbfad" transform="rotate(0 50 50)" />
    </svg>
  );
}

export function ThanarahLogoFull({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { icon: 'w-6 h-6', text: 'text-base' },
    md: { icon: 'w-8 h-8', text: 'text-xl' },
    lg: { icon: 'w-12 h-12', text: 'text-3xl' },
  };

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <ThanarahIcon className={sizes[size].icon} />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            'font-arabic font-semibold text-thanarah-700 tracking-wide',
            sizes[size].text
          )}
          dir="rtl"
        >
          ثنارة
        </span>
        <span className="text-[10px] font-medium text-thanarah-500 tracking-widest uppercase">
          THANARAH AI
        </span>
      </div>
    </div>
  );
}

export default ThanarahLogoFull;
