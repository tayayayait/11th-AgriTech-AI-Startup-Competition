import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import type { FieldRow } from "@/domain/fields/types";
import type { NpmsPestCandidate } from "@/services/npmsPestService";

const selectedFieldState = vi.hoisted(() => ({
  fields: [] as FieldRow[],
  selected: null as FieldRow | null,
  setSelectedId: vi.fn(),
}));

const dashboardServiceMocks = vi.hoisted(() => ({
  getLatestWeatherRisk: vi.fn(),
  getPestRisks: vi.fn(),
}));

const pestRiskForecastMocks = vi.hoisted(() => ({
  generateAndSavePestRiskForecast: vi.fn(),
}));

const taskServiceMocks = vi.hoisted(() => ({
  getPendingTaskCardsByField: vi.fn(),
}));

const timelineServiceMocks = vi.hoisted(() => ({
  getTimelineItemsByField: vi.fn(),
}));

const weatherServiceMocks = vi.hoisted(() => ({
  getLiveWeatherByLatLng: vi.fn(),
}));

const npmsServiceMocks = vi.hoisted(() => ({
  getAllNpmsPestCandidates: vi.fn(),
  getNpmsPestCandidates: vi.fn(),
  getNpmsPestDetail: vi.fn(),
}));

vi.mock("@/context/SelectedFieldContext", () => ({
  useSelectedField: () => ({
    fields: selectedFieldState.fields,
    selected: selectedFieldState.selected,
    selectedId: selectedFieldState.selected?.id ?? null,
    setSelectedId: selectedFieldState.setSelectedId,
  }),
}));

vi.mock("@/services/dashboardService", () => dashboardServiceMocks);
vi.mock("@/services/pestRiskForecastService", () => pestRiskForecastMocks);
vi.mock("@/services/taskService", () => taskServiceMocks);
vi.mock("@/services/timelineService", () => timelineServiceMocks);
vi.mock("@/services/weatherLiveService", () => weatherServiceMocks);
vi.mock("@/services/npmsPestService", () => npmsServiceMocks);

function makeField(overrides: Partial<FieldRow> = {}): FieldRow {
  return {
    id: "field-1",
    name: "테스트 필지",
    address: "테스트 주소",
    lat: 37.1,
    lng: 127.1,
    crop_name: "토마토",
    growth_stage: null,
    area_m2: 1200,
    pnu: null,
    farmmap_meta: {},
    risk_level: "low",
    risk_score: 12,
    updated_at: "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

function makeCandidate(index: number): NpmsPestCandidate {
  const isDisease = index <= 6;
  return {
    id: `VC010803:${isDisease ? "NP01" : "NP03"}:${index}`,
    kind: isDisease ? "disease" : "insect",
    divCode: isDisease ? "NP01" : "NP03",
    divName: isDisease ? "병" : "해충",
    cropCode: "VC010803",
    cropName: "토마토",
    name: `Candidate ${index}`,
    scientificName: null,
    thumbImg: null,
    detailServiceCode: isDisease ? "SVC05" : "SVC07",
    detailKey: `${index}`,
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const ui = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return render(ui);
}

describe("Dashboard NCPMS candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const field = makeField();
    selectedFieldState.fields = [field];
    selectedFieldState.selected = field;
    dashboardServiceMocks.getLatestWeatherRisk.mockResolvedValue(null);
    dashboardServiceMocks.getPestRisks.mockResolvedValue([]);
    pestRiskForecastMocks.generateAndSavePestRiskForecast.mockResolvedValue([]);
    taskServiceMocks.getPendingTaskCardsByField.mockResolvedValue([]);
    timelineServiceMocks.getTimelineItemsByField.mockResolvedValue([]);
    weatherServiceMocks.getLiveWeatherByLatLng.mockResolvedValue(null);
    npmsServiceMocks.getNpmsPestDetail.mockResolvedValue(null);
  });

  it("shows six NCPMS candidates per page and pages through all results", async () => {
    const candidates = Array.from({ length: 10 }, (_, index) => makeCandidate(index + 1));
    npmsServiceMocks.getAllNpmsPestCandidates.mockResolvedValue({ candidates, totalCount: candidates.length });
    npmsServiceMocks.getNpmsPestCandidates.mockResolvedValue(candidates);

    renderDashboard();

    await screen.findByText("Candidate 1");
    expect(screen.getByText("10건")).toBeInTheDocument();
    expect(screen.getByText("1-6 / 10건")).toBeInTheDocument();
    expect(screen.getByText("Candidate 6")).toBeInTheDocument();
    expect(screen.queryByText("Candidate 7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));

    await waitFor(() => {
      expect(screen.getByText("Candidate 7")).toBeInTheDocument();
    });
    expect(screen.getByText("7-10 / 10건")).toBeInTheDocument();
    expect(screen.queryByText("Candidate 1")).not.toBeInTheDocument();
  });

  it("resets NCPMS candidate pagination when the selected field changes", async () => {
    const firstCandidates = Array.from({ length: 10 }, (_, index) => makeCandidate(index + 1));
    const secondField = makeField({ id: "field-2", name: "두 번째 필지", crop_name: "토마토" });
    const secondCandidates = Array.from({ length: 7 }, (_, index) => ({
      ...makeCandidate(index + 1),
      id: `second-${index + 1}`,
      name: `Second Candidate ${index + 1}`,
    }));
    npmsServiceMocks.getAllNpmsPestCandidates
      .mockResolvedValueOnce({ candidates: firstCandidates, totalCount: firstCandidates.length })
      .mockResolvedValueOnce({ candidates: secondCandidates, totalCount: secondCandidates.length });
    npmsServiceMocks.getNpmsPestCandidates.mockResolvedValue(firstCandidates);

    const { rerender } = renderDashboard();
    await screen.findByText("Candidate 1");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await screen.findByText("Candidate 7");

    selectedFieldState.fields = [secondField];
    selectedFieldState.selected = secondField;
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Second Candidate 1");
    expect(screen.getByText("1-6 / 7건")).toBeInTheDocument();
    expect(screen.queryByText("Second Candidate 7")).not.toBeInTheDocument();
  });
});
