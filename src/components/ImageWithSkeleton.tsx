import { useState, type ImgHTMLAttributes } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** Extra classes for the wrapper. The wrapper is `relative` and takes the parent's size. */
  wrapperClassName?: string;
  /** Extra classes for the placeholder skeleton. */
  skeletonClassName?: string;
};

/**
 * Renders an <img> that stays hidden until fully decoded, with a shadcn
 * <Skeleton> pulse placeholder occupying the exact space to avoid the ugly
 * top-to-bottom progressive paint on slow connections.
 */
export function ImageWithSkeleton({
  wrapperClassName,
  skeletonClassName,
  className,
  onLoad,
  onError,
  ...imgProps
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <span className={cn("relative block h-full w-full overflow-hidden", wrapperClassName)}>
      {!loaded && !errored && (
        <Skeleton
          className={cn("absolute inset-0 h-full w-full rounded-none", skeletonClassName)}
        />
      )}
      <img
        loading="lazy"
        decoding="async"
        {...imgProps}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setErrored(true);
          setLoaded(true);
          onError?.(e);
        }}
        className={cn(
          "transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </span>
  );
}
