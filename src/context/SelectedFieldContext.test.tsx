import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/services/fieldService", () => ({
  getFieldsSortedByRiskScore: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/userPreferencesService", () => ({
  DEFAULT_NOTIFICATION_SETTINGS: {},
  getUserPreferences: vi.fn().mockResolvedValue({
    ownerId: "user-1",
    selectedFieldId: null,
    notificationSettings: {},
  }),
  saveSelectedFieldPreference: vi.fn().mockResolvedValue(undefined),
}));

import { SelectedFieldProvider, useSelectedField } from "@/context/SelectedFieldContext";

function RefreshButton() {
  const { refetch } = useSelectedField();
  return <button onClick={refetch}>refresh</button>;
}

describe("SelectedFieldProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("refreshes only the queries owned by the selected-field context", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <SelectedFieldProvider>
          <RefreshButton />
        </SelectedFieldProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));

    expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ["fields", "user-1"] });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ["user-preferences", "user-1"] });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
