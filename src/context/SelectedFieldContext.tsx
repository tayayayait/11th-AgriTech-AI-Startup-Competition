import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldRow } from "@/domain/fields/types";
import { useAuth } from "@/context/AuthContext";
import { getFieldsSortedByRiskScore } from "@/services/fieldService";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserPreferences,
  saveSelectedFieldPreference,
  type UserPreferences,
} from "@/services/userPreferencesService";

interface Ctx {
  fields: FieldRow[];
  selectedId: string | null;
  selected: FieldRow | null;
  setSelectedId: (id: string) => void;
  isLoading: boolean;
  refetch: () => void;
}

const SelectedFieldContext = createContext<Ctx | null>(null);
const SELECTED_FIELD_STORAGE_KEY = "fieldguard.selected.field.id";

function readStoredSelectedId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(SELECTED_FIELD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSelectedId(id: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (id) {
      window.localStorage.setItem(SELECTED_FIELD_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(SELECTED_FIELD_STORAGE_KEY);
    }
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

export function SelectedFieldProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedIdState] = useState<string | null>(() => readStoredSelectedId());

  const persistSelectedId = useCallback(
    (id: string | null) => {
      writeStoredSelectedId(id);
      if (user) {
        // Optimistically update the query cache to prevent race conditions
        qc.setQueryData<UserPreferences>(["user-preferences", user.id], (old) => {
          if (!old) {
            return {
              ownerId: user.id,
              selectedFieldId: id,
              notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
            };
          }
          return { ...old, selectedFieldId: id };
        });

        void saveSelectedFieldPreference(id).catch(() => undefined);
      }
    },
    [user, qc],
  );

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    persistSelectedId(id);
  }, [persistSelectedId]);

  const clearSelectedId = useCallback(() => {
    setSelectedIdState(null);
    persistSelectedId(null);
  }, [persistSelectedId]);

  const { data: preferences, isLoading: preferencesLoading } = useQuery({
    queryKey: ["user-preferences", user?.id],
    enabled: !!user,
    queryFn: getUserPreferences,
  });

  const { data: fieldsData = [], isLoading, isFetching } = useQuery({
    queryKey: ["fields", user?.id],
    enabled: !!user,
    queryFn: getFieldsSortedByRiskScore,
  });

  const fields = useMemo(() => fieldsData, [fieldsData]);

  useEffect(() => {
    if (!user) return;

    // If there are no fields, clear the selection
    if (!fields.length) {
      if (!isLoading && !isFetching && selectedId) {
        clearSelectedId();
      }
      return;
    }

    // Check if current selection is valid
    const hasCurrentSelection = selectedId ? fields.some((field) => field.id === selectedId) : false;
    
    // Check if preferred selection is valid
    const preferredId = preferences?.selectedFieldId;
    const hasPreferredSelection = preferredId ? fields.some((field) => field.id === preferredId) : false;

    // If current selection is valid, we don't forcefully override it with preferredId,
    // because that prevents the user from changing their selection.
    // The optimistic update in persistSelectedId ensures preferences stay in sync.
    if (hasCurrentSelection) {
      return;
    }

    // If current selection is invalid or null, try to set it to preferredId or the first field.
    if (!isFetching) {
      const nextSelectedId = hasPreferredSelection ? preferredId! : fields[0].id;
      setSelectedIdState(nextSelectedId);
      persistSelectedId(nextSelectedId);
    }
  }, [
    clearSelectedId,
    fields,
    isFetching,
    isLoading,
    persistSelectedId,
    preferences?.selectedFieldId,
    selectedId,
    user,
  ]);

  const refetch = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["fields", user?.id] });
    void qc.invalidateQueries({ queryKey: ["user-preferences", user?.id] });
  }, [qc, user?.id]);

  const selected = useMemo(
    () => fields.find((field) => field.id === selectedId) ?? null,
    [fields, selectedId],
  );

  const value = useMemo<Ctx>(
    () => ({
      fields,
      selectedId,
      selected,
      setSelectedId,
      isLoading: isLoading || preferencesLoading,
      refetch,
    }),
    [fields, selectedId, selected, setSelectedId, isLoading, preferencesLoading, refetch],
  );

  return <SelectedFieldContext.Provider value={value}>{children}</SelectedFieldContext.Provider>;
}

export function useSelectedField() {
  const ctx = useContext(SelectedFieldContext);
  if (!ctx) throw new Error("useSelectedField must be used inside SelectedFieldProvider");
  return ctx;
}
