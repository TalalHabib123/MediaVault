import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("field-select", className)} {...props}>
      {children}
    </select>
  );
}
