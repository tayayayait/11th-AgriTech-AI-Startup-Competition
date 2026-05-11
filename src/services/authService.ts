import { FIELDGUARD_OWNER_ID, supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface EmailPasswordCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials extends EmailPasswordCredentials {
  emailRedirectTo?: string;
}

export interface AuthResult {
  session: Session | null;
  user: User | null;
  claimedFields: number;
  needsEmailConfirmation?: boolean;
}

export interface WorkspaceClaimResult {
  claimedFields: number;
}

type WorkspaceClaimRpcPayload =
  | { claimed_fields?: number; claimedFields?: number }
  | Array<{ claimed_fields?: number; claimedFields?: number }>
  | number
  | null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getClaimedFieldCount(data: WorkspaceClaimRpcPayload): number {
  if (typeof data === "number") return data;
  if (Array.isArray(data)) return getClaimedFieldCount(data[0] ?? null);
  if (!data || typeof data !== "object") return 0;

  const value = data.claimed_fields ?? data.claimedFields;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function claimAnonymousWorkspace(
  anonymousOwnerId = FIELDGUARD_OWNER_ID,
): Promise<WorkspaceClaimResult> {
  const { data, error } = await supabase.rpc("claim_fieldguard_anonymous_workspace", {
    anonymous_owner_id: anonymousOwnerId,
  });

  if (error) throw error;

  return { claimedFields: getClaimedFieldCount(data as WorkspaceClaimRpcPayload) };
}

export async function getCurrentAuthSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  return data.session ?? null;
}

export async function ensureUserSession(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  return data.session?.user.id ?? FIELDGUARD_OWNER_ID;
}

export async function signInWithEmail(input: EmailPasswordCredentials): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
  });

  if (error) throw error;

  const claim = data.session ? await claimAnonymousWorkspace() : { claimedFields: 0 };

  return {
    session: data.session ?? null,
    user: data.user ?? data.session?.user ?? null,
    claimedFields: claim.claimedFields,
  };
}

export async function signUpWithEmail(input: SignUpCredentials): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(input.email),
    password: input.password,
    options: input.emailRedirectTo
      ? {
          emailRedirectTo: input.emailRedirectTo,
        }
      : undefined,
  });

  if (error) throw error;

  const claim = data.session ? await claimAnonymousWorkspace() : { claimedFields: 0 };

  return {
    session: data.session ?? null,
    user: data.user ?? data.session?.user ?? null,
    claimedFields: claim.claimedFields,
    needsEmailConfirmation: !data.session,
  };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
