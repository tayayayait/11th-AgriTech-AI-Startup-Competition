import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { ensureUserSession } from "@/services/authService";

export interface UserNotificationSettings {
  weatherRisk: boolean;
  pestRisk: boolean;
  taskReminder: boolean;
}

export interface UserPreferences {
  ownerId: string;
  selectedFieldId: string | null;
  notificationSettings: UserNotificationSettings;
}

type UserPreferencesRow = Tables<"user_preferences">;

export const DEFAULT_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  weatherRisk: true,
  pestRisk: true,
  taskReminder: true,
};

function pickBoolean(source: Record<string, unknown>, key: keyof UserNotificationSettings): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : DEFAULT_NOTIFICATION_SETTINGS[key];
}

function normalizeNotificationSettings(value: unknown): UserNotificationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  const source = value as Record<string, unknown>;
  return {
    weatherRisk: pickBoolean(source, "weatherRisk"),
    pestRisk: pickBoolean(source, "pestRisk"),
    taskReminder: pickBoolean(source, "taskReminder"),
  };
}

function mapPreferencesRow(ownerId: string, row: UserPreferencesRow | null): UserPreferences {
  if (!row) {
    return {
      ownerId,
      selectedFieldId: null,
      notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
    };
  }

  return {
    ownerId: row.owner_id,
    selectedFieldId: typeof row.selected_field_id === "string" ? row.selected_field_id : null,
    notificationSettings: normalizeNotificationSettings(row.notification_settings),
  };
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const ownerId = await ensureUserSession();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;

  return mapPreferencesRow(ownerId, data);
}

export async function saveSelectedFieldPreference(selectedFieldId: string | null): Promise<void> {
  const ownerId = await ensureUserSession();
  const payload: TablesInsert<"user_preferences"> = {
    owner_id: ownerId,
    selected_field_id: selectedFieldId,
  };
  const { error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "owner_id" });

  if (error) throw error;
}

export async function saveNotificationSettings(settings: UserNotificationSettings): Promise<void> {
  const ownerId = await ensureUserSession();
  const payload: TablesInsert<"user_preferences"> = {
    owner_id: ownerId,
    notification_settings: normalizeNotificationSettings(settings) as unknown as Json,
  };
  const { error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "owner_id" });

  if (error) throw error;
}
