import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 400;
const NOTIFICATION_LIMIT = 20;

export type NotificationKind = "trade" | "market" | "error" | "info";

interface NotificationEntry {
  id: string;
  key?: string;
  title: string;
  description?: string;
  kind: NotificationKind;
  href?: string;
  timestamp: number;
}

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
      notification?: NotificationEntry;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | { type: "READ_NOTIFICATIONS" }
  | { type: "RESET_NOTIFICATIONS" };

interface State {
  toasts: ToasterToast[];
  notifications: NotificationEntry[];
  unreadCount: number;
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
        ...(action.notification && {
          notifications: [action.notification, ...state.notifications].slice(
            0,
            NOTIFICATION_LIMIT,
          ),
          unreadCount: Math.min(state.unreadCount + 1, NOTIFICATION_LIMIT),
        }),
      };

    case "READ_NOTIFICATIONS":
      return { ...state, unreadCount: 0 };

    case "RESET_NOTIFICATIONS":
      return { ...state, toasts: [], notifications: [], unreadCount: 0 };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [], notifications: [], unreadCount: 0 };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id"> & {
  notificationKind?: NotificationKind;
  notificationHref?: string;
  notificationKey?: string;
};

function toast({
  notificationKind,
  notificationHref,
  notificationKey,
  ...props
}: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  if (
    notificationKey &&
    memoryState.notifications.some(({ key }) => key === notificationKey)
  ) {
    return { id, dismiss, update };
  }

  dispatch({
    type: "ADD_TOAST",
    notification:
      typeof props.title === "string"
        ? {
            id,
            key: notificationKey,
            title: props.title,
            description:
              typeof props.description === "string"
                ? props.description
                : undefined,
            kind:
              notificationKind ??
              (props.variant === "destructive" ? "error" : "info"),
            href: notificationHref,
            timestamp: Date.now(),
          }
        : undefined,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    setState(memoryState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

function markNotificationsRead() {
  if (memoryState.unreadCount) dispatch({ type: "READ_NOTIFICATIONS" });
}

function resetNotifications() {
  dispatch({ type: "RESET_NOTIFICATIONS" });
}

export { useToast, toast, markNotificationsRead, resetNotifications };
