import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Settings from "@/pages/Settings";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/context/SelectedFieldContext", () => ({
  useSelectedField: () => ({
    fields: [
      {
        id: "field-1",
        name: "경상북도 구미시 옥계동 밭",
        crop_name: "사과",
        address: "경상북도 구미시 옥계동",
      },
    ],
    refetch: vi.fn(),
  }),
}));

vi.mock("@/services/fieldService", () => ({
  deleteField: vi.fn(),
}));

vi.mock("@/services/userPreferencesService", () => ({
  DEFAULT_NOTIFICATION_SETTINGS: {
    weatherRisk: true,
    pestRisk: true,
    taskReminder: true,
  },
  getUserPreferences: vi.fn(),
  saveNotificationSettings: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Settings field management", () => {
  it("shows each field crop name with an explicit crop label", () => {
    renderSettings();

    expect(screen.getByText("작물: 사과")).toBeInTheDocument();
    expect(screen.getByText("경상북도 구미시 옥계동")).toBeInTheDocument();
  });
});
