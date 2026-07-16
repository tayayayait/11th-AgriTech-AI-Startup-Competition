import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentAuthSession,
  restoreAuthenticatedWorkspace,
  signInWithEmail,
  signOut as signOutFromSupabase,
  signUpWithEmail,
  type AuthResult,
} from "@/services/authService";

interface EmailPasswordInput {
  email: string;
  password: string;
}

interface SignUpInput extends EmailPasswordInput {
  emailRedirectTo?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  authError: string | null;
  signIn: (input: EmailPasswordInput) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "인증 상태를 확인하지 못했습니다.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getCurrentAuthSession()
      .then(async (currentSession) => {
        if (!active) return;
        await restoreAuthenticatedWorkspace(currentSession);
        if (!active) return;
        setSession(currentSession);
        setAuthError(null);
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(toErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError(null);
      if (!nextSession) {
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = useCallback(
    async (input: EmailPasswordInput) => {
      const result = await signInWithEmail(input);
      setSession(result.session);
      setAuthError(null);
      await queryClient.invalidateQueries();
      return result;
    },
    [queryClient],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const result = await signUpWithEmail(input);
      setSession(result.session);
      setAuthError(null);
      await queryClient.invalidateQueries();
      return result;
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await signOutFromSupabase();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      authError,
      signIn,
      signUp,
      signOut,
    }),
    [authError, isLoading, session, signIn, signOut, signUp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
