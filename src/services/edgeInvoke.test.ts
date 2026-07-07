import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { invokeEdgeFunction } from "@/services/edgeInvoke";

describe("invokeEdgeFunction", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends JSON content type when invoking edge functions", async () => {
    const body = { sourceUrl: "https://www.nongsaro.go.kr/week.pdf" };
    const signal = new AbortController().signal;
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });

    await invokeEdgeFunction("weekly-farm-briefing-proxy", body, {
      signal,
      timeout: 30000,
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "weekly-farm-briefing-proxy",
      expect.objectContaining({
        body,
        signal,
        timeout: 30000,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });
});
