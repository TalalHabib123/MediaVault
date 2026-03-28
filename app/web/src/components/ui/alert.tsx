import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneClasses: Record<AlertTone, string> = {
  info: "app-alert app-alert-info",
  success: "app-alert app-alert-success",
  warning: "app-alert app-alert-warning",
  danger: "app-alert app-alert-danger",
};

export function Alert(props: {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const {
    tone = "info",
    title,
    children,
    className,
    ...rest
  } = props;

  return (
    <div className={cn(toneClasses[tone], className)} {...rest}>
      {title ? <div className="text-sm font-semibold">{title}</div> : null}
      <div className={cn(title ? "mt-1 text-sm" : "text-sm")}>{children}</div>
    </div>
  );
}
