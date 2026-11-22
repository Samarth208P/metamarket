import { type ComponentPropsWithoutRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

export interface AnimatedShinyTextProps
  extends ComponentPropsWithoutRef<"span"> {
  shimmerWidth?: number;
}

export function AnimatedShinyText({
  className,
  shimmerWidth = 100,
  style,
  ...props
}: AnimatedShinyTextProps) {
  return (
    <span
      style={
        { "--shiny-width": `${shimmerWidth}px`, ...style } as CSSProperties
      }
      className={cn(
        "inline-block animate-shiny-text bg-foreground bg-gradient-to-r from-transparent via-primary/75 to-transparent bg-[length:var(--shiny-width)_100%] bg-clip-text bg-no-repeat text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-foreground forced-colors:text-[CanvasText]",
        className,
      )}
      {...props}
    />
  );
}
