import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * FormField — the single source of truth for label + control + hint spacing.
 *
 * Every form field in LinkBreeze admin MUST use this wrapper instead of
 * hand-rolling `<div className="flex flex-col gap-2">`.
 *
 * Spacing is locked:
 *   label → control: 8px (mb-2)
 *   control → hint:  6px (mt-1.5)
 *
 * See ../../../docs/DESIGN.md §Spacing for the full scale.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

