import { cn } from "@/lib/utils";

export function OmniLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-label="OmniAI">
      <defs>
        <linearGradient id="omni-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--glow-1)" />
          <stop offset="1" stopColor="var(--glow-2)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="none" stroke="url(#omni-g)" strokeWidth="3" />
      <circle cx="16" cy="16" r="4" fill="url(#omni-g)" />
    </svg>
  );
}
