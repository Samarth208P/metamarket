import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

interface AdminProtectedRouteProps {
  children: ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {user?.isAdmin ? children : <Navigate to="/" replace />}
    </ProtectedRoute>
  );
}
