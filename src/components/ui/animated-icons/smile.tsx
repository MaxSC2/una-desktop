"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface SmileIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SmileIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const TRANSITION: Transition = {
  duration: 0.3,
  ease: "easeInOut",
};

const MOUTH_VARIANTS: Variants = {
  normal: { scaleY: 1 },
  animate: { scaleY: [1, 1.3, 1] },
};

const EYE_VARIANTS: Variants = {
  normal: { scale: 1 },
  animate: { scale: [1, 0.8, 1] },
};

const SmileIcon = forwardRef<SmileIconHandle, SmileIconProps>(
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
          <circle cx="12" cy="12" r="10" />
          <motion.path
            animate={controls}
            d="M8 14s1.5 2 4 2 4-2 4-2"
            transition={TRANSITION}
            variants={MOUTH_VARIANTS}
          />
          <motion.line
            animate={controls}
            transition={TRANSITION}
            variants={EYE_VARIANTS}
            x1="9"
            x2="9.01"
            y1="9"
            y2="9"
          />
          <motion.line
            animate={controls}
            transition={TRANSITION}
            variants={EYE_VARIANTS}
            x1="15"
            x2="15.01"
            y1="9"
            y2="9"
          />
        </svg>
      </div>
    );
  }
);

SmileIcon.displayName = "SmileIcon";

export { SmileIcon };
