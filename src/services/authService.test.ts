import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIELDGUARD_OWNER_ID, supabase } from "@/integrations/supabase/client";
import { claimAnonymousWorkspace, signInWithEmail } from "@/services/authService";

vi.mock("@/integrations/supabase/client", () => ({
  FIELDGUARD_OWNER_ID: "11111111-1111-4111-8111-111111111111",
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

const signInWithPasswordMock = vi.mocked(supabase.auth.signInWithPassword);
const rpcMock = vi.mocked(supabase.rpc);

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims the local anonymous workspace for the authenticated user", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { claimed_fields: 2 },
      error: null,
    } as never);

    const result = await claimAnonymousWorkspace();

    expect(rpcMock).toHaveBeenCalledWith("claim_fieldguard_anonymous_workspace", {
      anonymous_owner_id: FIELDGUARD_OWNER_ID,
    });
    expect(result).toEqual({ claimedFields: 2 });
  });

  it("signs in with normalized email and claims the existing workspace", async () => {
    const session = { user: { id: "user-1", email: "farmer@example.com" } };
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session, user: session.user },
      error: null,
    } as never);
    rpcMock.mockResolvedValueOnce({
      data: { claimed_fields: 1 },
      error: null,
    } as never);

    const result = await signInWithEmail({
      email: " FARMER@EXAMPLE.COM ",
      password: "secret-password",
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "farmer@example.com",
      password: "secret-password",
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.session).toBe(session);
    expect(result.claimedFields).toBe(1);
  });

  it("does not claim a workspace when sign-in fails", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new Error("invalid credentials"),
    } as never);

    await expect(
      signInWithEmail({
        email: "farmer@example.com",
        password: "bad-password",
      }),
    ).rejects.toThrow("invalid credentials");

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
