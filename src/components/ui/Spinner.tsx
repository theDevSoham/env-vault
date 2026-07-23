import { cn } from "./cn";

/** Pure-CSS spinner (keyframes in globals.css). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin-slow",
        className
      )}
    />
  );
}
