import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CircleAlert,
  Info,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatedList } from "@/components/ui/animated-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { markNotificationsRead, useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const notificationStyles = {
  trade: {
    icon: ArrowLeftRight,
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  market: { icon: CalendarClock, color: "bg-primary/10 text-primary" },
  error: {
    icon: CircleAlert,
    color: "bg-destructive/10 text-red-700 dark:text-red-300",
  },
  info: { icon: Info, color: "bg-muted text-muted-foreground" },
};

const timestampFormat = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount } = useToast();

  useEffect(() => {
    if (open && unreadCount) markNotificationsRead();
  }, [open, unreadCount]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative size-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={
            unreadCount
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
              aria-hidden="true"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={dialogRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialogRef.current?.focus({ preventScroll: true });
        }}
        overlayClassName="bg-black/40"
        className="left-auto right-4 top-[4.5rem] w-[calc(100%-2rem)] max-w-sm translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-xl p-0 !animate-none focus:outline-none sm:right-6"
      >
        <DialogHeader className="border-b px-4 py-4 pr-12 text-left">
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            Recent activity from this session.
          </DialogDescription>
        </DialogHeader>
        {notifications.length ? (
          <div className="max-h-[min(24rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain p-2">
            <AnimatedList
              live
              role="list"
              aria-label="Recent notifications"
              className="gap-1"
            >
              {notifications.map(
                ({ id, title, description, kind, href, timestamp }) => {
                  const { icon: Icon, color } = notificationStyles[kind];
                  const content = (
                    <>
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg",
                          color,
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block text-sm font-semibold leading-snug">
                          {title}
                        </span>
                        {description && (
                          <span className="block text-xs leading-relaxed text-muted-foreground">
                            {description}
                          </span>
                        )}
                        <time
                          dateTime={new Date(timestamp).toISOString()}
                          className="block text-[11px] text-muted-foreground"
                        >
                          {timestampFormat.format(timestamp)}
                        </time>
                      </span>
                      {href && (
                        <ArrowUpRight
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  );

                  return href ? (
                    <Link
                      key={id}
                      to={href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={id}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                    >
                      {content}
                    </div>
                  );
                },
              )}
            </AnimatedList>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Bell className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">You’re all caught up.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
