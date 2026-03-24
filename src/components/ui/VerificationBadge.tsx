import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VerificationBadgeProps {
  type: 'green' | 'blue' | 'none';
  size?: 'sm' | 'md';
  className?: string;
}

export function VerificationBadge({ type, size = 'md', className }: VerificationBadgeProps) {
  if (type === 'none') return null;

  const color = type === 'green' ? 'text-green-500' : 'text-blue-500';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const title = type === 'green' ? 'Verified – Official BCTV Account' : 'Verified – Public Account';

  return (
    <span title={title} className={cn('inline-flex items-center', className)}>
      <BadgeCheck className={cn(iconSize, color)} />
    </span>
  );
}
