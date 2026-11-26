import type { ReactNode } from "react";

export function DisclosurePanel({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="ui-disclosure"
      data-open={open}
      aria-hidden={!open}
      {...(open ? {} : { inert: "" })}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
