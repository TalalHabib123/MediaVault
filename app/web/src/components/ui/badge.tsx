import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "info"
  | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  default: "badge badge-default",
  accent: "badge badge-accent",
  success: "badge badge-success",
  warning: "badge badge-warning",
  info: "badge badge-info",
  danger: "badge badge-danger",
};

export function Badge({
  className,
  children,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </span>
  );
}
