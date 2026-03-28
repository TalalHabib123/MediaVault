import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface-card", className)} {...props} />;
}

export function CardHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
        props.className,
      )}
    >
      <div>
        <h3 className="section-title">{props.title}</h3>
        {props.description ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}

export function CardContent(props: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-5", props.className)}>{props.children}</div>;
}
