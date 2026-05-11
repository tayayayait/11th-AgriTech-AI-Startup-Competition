import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, isLoading, authError } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          인증 상태 확인 중
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-destructive">
        {authError}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
