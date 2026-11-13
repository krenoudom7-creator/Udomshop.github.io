import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function SafeImage({ src, alt, className = '', priority = false }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F2EFE9] to-[#E5E0D5] text-[#6B6559] ${className}`}
        role="img"
        aria-label={alt}
      >
        <ShoppingBag className="h-8 w-8 stroke-[1.25] opacity-60" />
        <span className="mt-2 px-3 text-center text-xs font-medium line-clamp-1 opacity-75">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
