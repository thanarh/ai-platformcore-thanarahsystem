'use client';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const sizes = {
  sm: { w: 80,  h: 32  },
  md: { w: 110, h: 44  },
  lg: { w: 160, h: 64  },
};

export function ThanarahLogoFull({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { w, h } = sizes[size];
  return (
    <Image
      src="/thanarah-logo.png"
      alt="Thanarah AI"
      width={w}
      height={h}
      className={cn('object-contain', className)}
      style={{ width: 'auto', height: h }}
      priority
    />
  );
}

// Keep backward-compat exports used elsewhere in the codebase
export function ThanarahIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/thanarah-logo.png"
      alt="Thanarah AI"
      width={32}
      height={32}
      style={{ width: 'auto', height: 32 }}
      className={cn('object-contain', className)}
      priority
    />
  );
}

export default ThanarahLogoFull;
