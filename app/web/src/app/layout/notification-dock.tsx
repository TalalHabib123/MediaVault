import type { ReactNode } from "react";

export function NotificationDock(props: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-40 flex w-full max-w-md flex-col gap-3 md:right-6 md:top-6">
      {props.children}
    </div>
  );
}
