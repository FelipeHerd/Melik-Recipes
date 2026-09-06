import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton that mirrors the real /auth layout (logo + card + tabs + form).
 * `variant` picks between the login field set and the longer signup one.
 */
export function AuthSkeleton({ variant = "login" }: { variant?: "login" | "signup" }) {
  return (
    <div className="mt-6 grid gap-4" aria-busy="true" aria-live="polite">
      {variant === "signup" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      )}
      {variant === "signup" && <FieldSkeleton />}
      <FieldSkeleton />
      <FieldSkeleton />
      {variant === "signup" && (
        <>
          <div className="grid gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-40" />
            ))}
          </div>
          <FieldSkeleton />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </>
      )}
      {variant === "login" && <Skeleton className="ml-auto h-3 w-40" />}
      <Skeleton className="h-11 w-full rounded-2xl" />
    </div>
  );
}

function FieldSkeleton() {
  return (
    <div className="grid gap-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

/** Full-page pending state for the /auth route. */
export function AuthPageSkeleton() {
  return (
    <div className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto max-w-md">
        <div className="inline-flex items-center gap-2.5">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="mt-8 rounded-3xl border border-border bg-card/40 p-6 shadow-sm sm:p-8">
          <div className="flex gap-1 rounded-2xl bg-card p-1">
            <Skeleton className="h-9 flex-1 rounded-xl" />
            <Skeleton className="h-9 flex-1 rounded-xl" />
          </div>
          <AuthSkeleton />
        </div>
      </div>
    </div>
  );
}
