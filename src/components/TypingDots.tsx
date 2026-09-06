// Shared "assistant is thinking" indicator: three bouncing dots.
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      aria-label="Escribiendo…"
      role="status"
    >
      <Dot />
      <Dot delay={150} />
      <Dot delay={300} />
    </span>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
