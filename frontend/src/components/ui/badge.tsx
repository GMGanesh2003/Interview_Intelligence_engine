import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-mono uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-signal/40 bg-signal/10 text-signal",
        warn: "border-warn/40 bg-warn/10 text-warn",
        alert: "border-alert/40 bg-alert/10 text-alert",
        muted: "border-line bg-panel-raised text-muted",
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
