import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserSession } from "@/services/authService";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserPreferences,
  saveNotificationSettings,
  saveSelectedFieldPreference,
} from "@/services/userPreferencesService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/services/authService", () => ({
  ensureUserSession: vi.fn(),
}));

const fromMock = vi.mocked(supabase.from);
const ensureUserSessionMock = vi.mocked(ensureUserSession);

describe("userPreferencesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUserSessionMock.mockResolvedValue("user-1");
  });

  it("returns default preferences when no user preference row exists", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select } as never);

    const preferences = await getUserPreferences();

    expect(fromMock).toHaveBeenCalledWith("user_preferences");
    expect(eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(preferences).toEqual({
      ownerId: "user-1",
      selectedFieldId: null,
      notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
    });
  });

  it("normalizes stored notification settings and selected field", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: "user-1",
        selected_field_id: "field-1",
        notification_settings: {
          weatherRisk: false,
          pestRisk: true,
        },
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select } as never);

    const preferences = await getUserPreferences();

    expect(preferences).toEqual({
      ownerId: "user-1",
      selectedFieldId: "field-1",
      notificationSettings: {
        weatherRisk: false,
        pestRisk: true,
        taskReminder: true,
      },
    });
  });

  it("persists selected field id with an authenticated owner id", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert } as never);

    await saveSelectedFieldPreference("field-1");

    expect(upsert).toHaveBeenCalledWith(
      {
        owner_id: "user-1",
        selected_field_id: "field-1",
      },
      { onConflict: "owner_id" },
    );
  });

  it("persists notification settings with an authenticated owner id", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert } as never);

    await saveNotificationSettings({
      weatherRisk: false,
      pestRisk: false,
      taskReminder: true,
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        owner_id: "user-1",
        notification_settings: {
          weatherRisk: false,
          pestRisk: false,
          taskReminder: true,
        },
      },
      { onConflict: "owner_id" },
    );
  });
});
