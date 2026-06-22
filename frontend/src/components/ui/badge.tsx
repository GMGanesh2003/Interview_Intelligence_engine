import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "border-signal/30 bg-signal-dim text-signal",
        warn:    "border-warn/30 bg-warn-dim text-warn",
        alert:   "border-alert/30 bg-alert-dim text-alert",
        muted:   "border-line bg-panel-raised text-muted",
        blue:    "border-blue/30 bg-blue-dim text-blue",
        purple:  "border-purple/30 bg-purple-dim text-purple",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
