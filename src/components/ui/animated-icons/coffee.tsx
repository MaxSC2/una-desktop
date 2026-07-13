"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface CoffeeIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CoffeeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const STEAM_TRANSITION: Transition = {
  duration: 0.6,
  ease: "easeInOut",
  repeat: 1,
};

const STEAM_VARIANTS: Variants = {
  normal: { scaleY: 1, y: 0 },
  animate: { scaleY: [1, 1.2, 1], y: [0, -1, 0] },
};

const HANDLE_VARIANTS: Variants = {
  normal: { pathLength: 1 },
  animate: { pathLength: [1, 0.8, 1] },
};

const CoffeeIcon = forwardRef<CoffeeIconHandle, CoffeeIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            d="M17 8h1a4 4 0 1 1 0 8h-1"
            transition={STEAM_TRANSITION}
            variants={HANDLE_VARIANTS}
          />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <motion.line
            animate={controls}
            transition={STEAM_TRANSITION}
            variants={STEAM_VARIANTS}
            x1="6"
            x2="6"
            y1="2"
            y2="4"
          />
          <motion.line
            animate={controls}
            transition={{ ...STEAM_TRANSITION, delay: 0.1 }}
            variants={STEAM_VARIANTS}
            x1="10"
            x2="10"
            y1="2"
            y2="4"
          />
          <motion.line
            animate={controls}
            transition={{ ...STEAM_TRANSITION, delay: 0.2 }}
            variants={STEAM_VARIANTS}
            x1="14"
            x2="14"
            y1="2"
            y2="4"
          />
        </svg>
      </div>
    );
  }
);

CoffeeIcon.displayName = "CoffeeIcon";

export { CoffeeIcon };
