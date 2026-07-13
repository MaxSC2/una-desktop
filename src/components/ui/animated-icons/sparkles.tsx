"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface SparklesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SparklesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const SPARKLE_TRANSITION: Transition = {
  duration: 0.4,
  ease: "easeInOut",
  repeat: 1,
};

const SMALL_SPARKLE: Variants = {
  normal: { scale: 1, opacity: 1 },
  animate: { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] },
};

const LARGE_SPARKLE: Variants = {
  normal: { scale: 1, opacity: 1 },
  animate: { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] },
};

const SparklesIcon = forwardRef<SparklesIconHandle, SparklesIconProps>(
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
            d="M12 3v2"
            transition={SPARKLE_TRANSITION}
            variants={SMALL_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="m14.5 4.5-1.41 1.41"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.05 }}
            variants={SMALL_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="M18 12h2"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.1 }}
            variants={LARGE_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="m16.5 15.09 1.41 1.41"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.15 }}
            variants={SMALL_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="M12 19v2"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.2 }}
            variants={SMALL_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="m6.09 16.5-1.41 1.41"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.05 }}
            variants={SMALL_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="M6 12H4"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.1 }}
            variants={LARGE_SPARKLE}
          />
          <motion.path
            animate={controls}
            d="m7.5 8.91 1.41-1.41"
            transition={{ ...SPARKLE_TRANSITION, delay: 0.05 }}
            variants={SMALL_SPARKLE}
          />
        </svg>
      </div>
    );
  }
);

SparklesIcon.displayName = "SparklesIcon";

export { SparklesIcon };
