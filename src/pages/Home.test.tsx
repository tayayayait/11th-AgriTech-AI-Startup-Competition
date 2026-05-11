import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/pages/Home";

const weatherServiceMocks = vi.hoisted(() => ({
  getLiveWeatherByLatLng: vi.fn(),
}));

vi.mock("@/services/weatherLiveService", () => weatherServiceMocks);

describe("Home", () => {
  beforeEach(() => {
    weatherServiceMocks.getLiveWeatherByLatLng.mockReset();
    weatherServiceMocks.getLiveWeatherByLatLng.mockResolvedValue({
      precipitation: 0,
      temperature: 18,
      wind: 1.5,
      humidity: 55,
      sourceStatus: "connected",
      collectedAt: "2026-05-09T08:00:00.000Z",
      summary: "기상 위험 신호가 낮습니다.",
      riskScore: 0,
      riskLevel: "low",
      riskFactors: [],
    });
  });

  it("introduces the service and links users into the dashboard", async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "현장 변수를 오늘의 작업으로 바꿉니다." })).toBeInTheDocument();
    expect(screen.getByText("필지 등록")).toBeInTheDocument();
    expect(screen.getByText("위험 확인")).toBeInTheDocument();
    expect(screen.getByText("작업 실행")).toBeInTheDocument();
    expect(screen.queryByText("주최 기관")).not.toBeInTheDocument();
    expect(screen.getAllByText(/농림축산식품부, 농촌진흥청, 한국농어촌공사/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "미래 농업의 기준, 지금 경험하세요." })).toBeInTheDocument();
    expect(screen.queryByText(/홈 화면은 소개와 진입에 집중합니다/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("FieldGuard AI farmland drone loop")).toHaveAttribute(
      "src",
      "/hero-farm-drone-loop-browser.mp4",
    );

    const dashboardLinks = screen.getAllByRole("link", { name: /대시보드/ });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    dashboardLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/dashboard");
    });
    expect(screen.getByText("강수")).toBeInTheDocument();
    expect(await screen.findByText("0mm")).toBeInTheDocument();
    expect(screen.getByText("기온")).toBeInTheDocument();
    expect(screen.getByText("18도")).toBeInTheDocument();
    expect(screen.getByText("풍속")).toBeInTheDocument();
    expect(screen.getByText("1.5m/s")).toBeInTheDocument();
    expect(screen.getByText("습도")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
  });

  it("places Seoul weather API data in the hero risk signal", async () => {
    weatherServiceMocks.getLiveWeatherByLatLng.mockResolvedValueOnce({
      precipitation: 12.4,
      temperature: 21,
      wind: 2.1,
      humidity: 86,
      sourceStatus: "connected",
      collectedAt: "2026-05-09T08:10:00.000Z",
      summary: "강수 12.4mm, 고습 86%",
      riskScore: 55,
      riskLevel: "medium",
      riskFactors: [],
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(weatherServiceMocks.getLiveWeatherByLatLng).toHaveBeenCalledWith(37.5665, 126.978);
    });

    expect(await screen.findByText("서울 기준 기상청 기상 실황")).toBeInTheDocument();
    expect(screen.getByText("강수")).toBeInTheDocument();
    expect(screen.getByText("12.4mm")).toBeInTheDocument();
    expect(screen.getByText("기온")).toBeInTheDocument();
    expect(screen.getByText("21도")).toBeInTheDocument();
    expect(screen.getByText("풍속")).toBeInTheDocument();
    expect(screen.getByText("2.1m/s")).toBeInTheDocument();
    expect(screen.getByText("습도")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });
});
