import { cn } from '@/lib/utils';

interface LiveBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function LiveBadge({ className, size = 'sm' }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded bg-destructive text-destructive-foreground font-bold uppercase tracking-wider',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      Live
    </span>
  );
}
