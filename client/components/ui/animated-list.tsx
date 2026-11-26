import React, {
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type MotionProps,
} from "framer-motion";

import { cn } from "@/lib/utils";

export function AnimatedListItem({
  children,
  live = false,
}: {
  children: React.ReactNode;
  live?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const animations: MotionProps = reducedMotion
    ? {}
    : live
      ? {
          initial: { y: -6, opacity: 0 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: 0.18, ease: "easeOut" },
        }
      : {
          initial: { scale: 0.985, opacity: 0 },
          animate: { scale: 1, opacity: 1, originY: 0 },
          exit: { scale: 0.985, opacity: 0 },
          transition: { duration: 0.22, ease: [0.22, 0.68, 0.2, 1] },
        };

  return (
    <motion.div
      {...animations}
      layout={reducedMotion ? false : live ? "position" : true}
      role={live ? "listitem" : undefined}
      className="mx-auto w-full"
    >
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
  delay?: number;
  live?: boolean;
}

export const AnimatedList = React.memo(
  ({
    children,
    className,
    delay = 1000,
    live = false,
    ...props
  }: AnimatedListProps) => {
    const reducedMotion = useReducedMotion();
    const [index, setIndex] = useState(0);
    const childrenArray = useMemo(
      () => React.Children.toArray(children),
      [children],
    );

    useEffect(() => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      if (!live && !reducedMotion && index < childrenArray.length - 1) {
        timeout = setTimeout(() => {
          setIndex((prevIndex) => (prevIndex + 1) % childrenArray.length);
        }, delay);
      }

      return () => {
        if (timeout !== null) {
          clearTimeout(timeout);
        }
      };
    }, [index, delay, childrenArray.length, live, reducedMotion]);

    const itemsToShow = useMemo(() => {
      if (live || reducedMotion) return childrenArray;
      return childrenArray.slice(0, index + 1).reverse();
    }, [index, childrenArray, live, reducedMotion]);

    return (
      <div
        className={cn(`flex flex-col items-center gap-4`, className)}
        {...props}
      >
        <AnimatePresence initial={!live}>
          {itemsToShow.map((item) => (
            <AnimatedListItem
              key={(item as React.ReactElement).key}
              live={live}
            >
              {item}
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </div>
    );
  },
);

AnimatedList.displayName = "AnimatedList";
