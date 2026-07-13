"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface Volume2IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface Volume2IconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const TRANSITION: Transition = {
  duration: 0.4,
  ease: "easeInOut",
};

const WAVE_VARIANTS: Variants = {
  normal: { scaleY: 1, opacity: 1 },
  animate: { scaleY: [1, 1.3, 1], opacity: [1, 0.7, 1] },
};

const Volume2Icon = forwardRef<Volume2IconHandle, Volume2IconProps>(
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
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <motion.path
            animate={controls}
            d="M15.54 8.46a5 5 0 0 1 0 7.07"
            transition={TRANSITION}
            variants={WAVE_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M19.07 4.93a10 10 0 0 1 0 14.14"
            transition={{ ...TRANSITION, delay: 0.1 }}
            variants={WAVE_VARIANTS}
          />
        </svg>
      </div>
    );
  }
);

Volume2Icon.displayName = "Volume2Icon";

export { Volume2Icon };
