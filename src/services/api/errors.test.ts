import { describe, expect, it } from "vitest";
import { EdgeInvokeError } from "@/services/edgeInvoke";
import { ApiAdapterError, toApiAdapterError } from "@/services/api/errors";

describe("toApiAdapterError", () => {
  it("preserves adapter errors", () => {
    const error = new ApiAdapterError("failed", { source: "kma", code: "upstream_error" });

    expect(toApiAdapterError(error, "kma")).toBe(error);
  });

  it("maps edge invoke errors with source metadata", () => {
    const error = new EdgeInvokeError("upstream failed", {
      code: "gemini_upstream_error",
      details: { status: 400 },
    });

    const mapped = toApiAdapterError(error, "gemini");

    expect(mapped).toBeInstanceOf(ApiAdapterError);
    expect(mapped.source).toBe("gemini");
    expect(mapped.code).toBe("upstream_error");
    expect(mapped.details).toEqual({ status: 400 });
  });
});

