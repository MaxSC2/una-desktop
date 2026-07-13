"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface FileTextIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FileTextIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const FOLDER_TRANSITION: Transition = {
  duration: 0.3,
  ease: "easeInOut",
};

const LINES_VARIANTS: Variants = {
  normal: { scaleX: 1 },
  animate: { scaleX: [1, 0.8, 1] },
};

const FileTextIcon = forwardRef<FileTextIconHandle, FileTextIconProps>(
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
            d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
            transition={FOLDER_TRANSITION}
            variants={{
              normal: { scale: 1 },
              animate: { scale: [1, 1.02, 1] },
            }}
          />
          <motion.path
            animate={controls}
            d="M14 2v4a2 2 0 0 0 2 2h4"
            transition={FOLDER_TRANSITION}
            variants={{
              normal: { scale: 1 },
              animate: { scale: [1, 1.02, 1] },
            }}
          />
          <motion.line
            animate={controls}
            transition={FOLDER_TRANSITION}
            variants={LINES_VARIANTS}
            x1="8"
            x2="16"
            y1="13"
            y2="13"
          />
          <motion.line
            animate={controls}
            transition={{ ...FOLDER_TRANSITION, delay: 0.05 }}
            variants={LINES_VARIANTS}
            x1="8"
            x2="16"
            y1="17"
            y2="17"
          />
          <motion.line
            animate={controls}
            transition={{ ...FOLDER_TRANSITION, delay: 0.1 }}
            variants={LINES_VARIANTS}
            x1="8"
            x2="12"
            y1="9"
            y2="9"
          />
        </svg>
      </div>
    );
  }
);

FileTextIcon.displayName = "FileTextIcon";

export { FileTextIcon };
