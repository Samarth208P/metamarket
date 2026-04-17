import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

interface ProtectedRouteProps {
  children: ReactNode;
  allowGuest?: boolean;
}

export function ProtectedRoute({
  children,
  allowGuest = true,
}: ProtectedRouteProps) {
  const { isAuthenticated, isGuestUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <img src="/animated-logo.svg" alt="Loading" className="w-48 h-48" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowGuest && isGuestUser) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
