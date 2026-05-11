import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CloudRain,
  CloudSun,
  ShieldCheck,
  Sprout,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getLiveWeatherByLatLng, type LiveWeatherResult } from "@/services/weatherLiveService";

const SEOUL_WEATHER_COORDS = {
  lat: 37.5665,
  lng: 126.978,
} as const;

interface HeroWeatherMetric {
  label: string;
  value: string;
}

interface HeroWeatherSignal {
  label: string;
  metrics: HeroWeatherMetric[];
  guidance: string;
}

function formatWeatherValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

function weatherMetricValue(value: number | null, unit: string): string {
  return value === null ? "확인 중" : `${formatWeatherValue(value)}${unit}`;
}

function buildHeroWeatherSignal(weather: LiveWeatherResult | null): HeroWeatherSignal {
  if (!weather || weather.sourceStatus !== "connected") {
    return {
      label: "서울 기준 기상청 기상 실황",
      metrics: [
        { label: "강수", value: "확인 중" },
        { label: "기온", value: "확인 중" },
        { label: "풍속", value: "확인 중" },
        { label: "습도", value: "확인 중" },
      ],
      guidance: "서울 기상 API 연결 지연, 대시보드에서 재확인",
    };
  }

  return {
    label: "서울 기준 기상청 기상 실황",
    metrics: [
      { label: "강수", value: weatherMetricValue(weather.precipitation, "mm") },
      { label: "기온", value: weatherMetricValue(weather.temperature, "도") },
      { label: "풍속", value: weatherMetricValue(weather.wind, "m/s") },
      { label: "습도", value: weatherMetricValue(weather.humidity, "%") },
    ],
    guidance: "방제 전 점검 권고",
  };
}

const organizerNames =
  "농림축산식품부, 농촌진흥청, 한국농어촌공사, 한국농수산식품유통공사, 한국마사회, 축산물품질평가원, 농림식품기술기획평가원, 농림수산식품교육문화정보원, 농업정책보험금융원, 한국농업기술진흥원";

const workflowSteps = [
  {
    label: "필지 등록",
    text: "주소, 작물, 면적을 기준으로 현장 판단 단위를 고정합니다.",
  },
  {
    label: "위험 확인",
    text: "기상 위험과 병해충 후보를 한 화면에서 비교합니다.",
  },
  {
    label: "작업 실행",
    text: "권장 작업, 진단 결과, 리포트를 기록 흐름으로 남깁니다.",
  },
];

const featureCards = [
  {
    title: "위험 신호 통합",
    description: "기상, 작물, 필지 정보를 묶어 오늘 먼저 확인할 위험을 분리합니다.",
  },
  {
    title: "사진 기반 진단",
    description: "현장 사진으로 이상 징후를 확인하고 공식 자료 기반 조치를 연결합니다.",
  },
  {
    title: "작업·상담 흐름",
    description: "권장 작업, 농약 안전 정보, 상담 리포트를 같은 화면 흐름에서 관리합니다.",
  },
];

export default function Home() {
  const [heroWeatherSignal, setHeroWeatherSignal] = useState<HeroWeatherSignal>({
    label: "서울 기준 기상청 기상 실황",
    metrics: [
      { label: "강수", value: "확인 중" },
      { label: "기온", value: "확인 중" },
      { label: "풍속", value: "확인 중" },
      { label: "습도", value: "확인 중" },
    ],
    guidance: "서울 기상 정보 확인 중",
  });

  useEffect(() => {
    let isMounted = true;

    getLiveWeatherByLatLng(SEOUL_WEATHER_COORDS.lat, SEOUL_WEATHER_COORDS.lng)
      .then((weather) => {
        if (isMounted) {
          setHeroWeatherSignal(buildHeroWeatherSignal(weather));
        }
      })
      .catch(() => {
        if (isMounted) {
          setHeroWeatherSignal(buildHeroWeatherSignal(null));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <div className="fg-noise" aria-hidden="true" />
      <nav className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-3xl sm:top-6">
        <div className="flex items-center justify-between gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-3 shadow-[0_18px_60px_rgba(23,33,27,0.08)] backdrop-blur-2xl sm:px-5">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="FieldGuard AI 홈">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sprout className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-bold tracking-normal sm:text-base">FieldGuard AI</span>
          </Link>
          <Link
            to="/dashboard"
            aria-label="대시보드로 이동"
            className="hidden h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 sm:inline-flex"
          >
            <span>대시보드</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <main className="relative h-[100svh] overflow-y-auto overflow-x-hidden scroll-smooth snap-y snap-mandatory bg-zinc-50 text-zinc-950">
        <section className="relative flex min-h-[100svh] snap-start items-center px-4 pb-12 pt-28 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0">
              <Badge className="mb-7 h-8 gap-2 rounded-full bg-lime-600/10 px-3 text-xs font-bold uppercase tracking-widest text-lime-700 hover:bg-lime-600/10">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                공공데이터 기반 농업 의사결정
              </Badge>
              <h1
                aria-label="현장 변수를 오늘의 작업으로 바꿉니다."
                className="break-keep text-4xl font-black leading-[1.08] tracking-normal text-zinc-950 sm:text-6xl lg:text-[5.25rem]"
              >
                <span className="block">현장 변수를</span>
                <span className="block">
                  오늘의 <span className="bg-gradient-to-r from-lime-700 to-lime-400 bg-clip-text text-transparent">작업</span>으로
                </span>
                <span className="block">바꿉니다.</span>
              </h1>
              <p className="mt-6 max-w-[340px] break-words text-base leading-7 text-zinc-600 sm:max-w-xl sm:text-lg">
                FieldGuard AI는 필지별 기상 위험, 병해충 후보, 사진 진단, 작업 권고를 한 흐름으로 묶어
                농가가 대시보드에서 바로 판단하도록 만든 현장형 서비스입니다.
              </p>

              <div className="mt-9 flex max-w-[340px] flex-col gap-3 sm:max-w-none sm:flex-row">
                <Link
                  to="/dashboard"
                  className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-lime-600 px-7 text-base font-bold text-white shadow-[0_18px_38px_rgba(101,163,13,0.24)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] sm:w-auto"
                >
                  대시보드로 시작하기
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            </div>

            <div className="relative mx-auto min-h-[430px] w-full max-w-[340px] overflow-hidden rounded-[2rem] shadow-[0_30px_90px_rgba(9,9,11,0.18)] sm:max-w-none lg:min-h-[620px]">
              <video
                aria-label="FieldGuard AI farmland drone loop"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                src="/hero-farm-drone-loop-browser.mp4"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/55 via-zinc-950/10 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/40 bg-white/80 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-lime-100 text-lime-700">
                    <CloudRain className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1" aria-live="polite">
                    <p className="text-xs font-semibold text-zinc-500">{heroWeatherSignal.label}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
                      {heroWeatherSignal.metrics.map((metric) => (
                        <span key={metric.label} className="whitespace-nowrap">
                          <span className="font-bold text-zinc-500">{metric.label}</span>{" "}
                          <span className="font-black text-zinc-950">{metric.value}</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs font-black text-zinc-950">{heroWeatherSignal.guidance}</p>
                  </div>
                  <div className="ml-auto hidden items-end gap-1 sm:flex">
                    <span className="h-8 w-2 rounded-full bg-lime-700" />
                    <span className="h-6 w-2 rounded-full bg-lime-500" />
                    <span className="h-10 w-2 rounded-full bg-lime-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="flex min-h-[100svh] snap-start items-center bg-white px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="break-keep text-3xl font-black tracking-normal text-zinc-950 sm:text-5xl">
                홈에서 바로 이해하고, 대시보드에서 바로 실행합니다.
              </h2>
              <p className="mt-4 break-keep text-base leading-7 text-zinc-500 sm:text-lg">
                실제 서비스 흐름은 단순합니다. 필지를 등록하고, 위험을 확인하고, 오늘 할 일을 기록합니다.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <article key={step.label} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-6 shadow-sm">
                  <div className="mb-8 flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-lime-600 text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <CheckCircle2 className="h-5 w-5 text-lime-600" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-950">{step.label}</h3>
                  <p className="mt-3 break-keep text-sm leading-6 text-zinc-500">{step.text}</p>
                </article>
              ))}
            </div>

            <div className="fg-mask-edges mt-14 overflow-hidden" aria-label={organizerNames}>
              <div className="flex w-max gap-12 whitespace-nowrap text-xl font-black leading-8 text-zinc-300 [animation:fg-marquee_36s_linear_infinite]">
                {[organizerNames, organizerNames].map((names, index) => (
                  <span key={`${names}-${index}`}>{names}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="flex min-h-[100svh] snap-start items-center bg-zinc-50 px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-10 max-w-3xl">
              <h2 className="break-keep text-4xl font-black tracking-normal text-zinc-950 sm:text-5xl">
                데이터가 흩어져 있으면 판단도 늦어집니다.
              </h2>
              <p className="mt-4 break-keep text-lg leading-7 text-zinc-500">
                FieldGuard AI는 농업 공공데이터와 현장 입력을 한 대시보드로 압축합니다.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
              <article className="group/showcase relative min-h-[420px] overflow-hidden rounded-[2rem] border border-zinc-200 p-6 shadow-[0_24px_70px_rgba(9,9,11,0.06)] lg:col-span-8">
                {/* 배경 이미지 */}
                <div 
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[1.5s] ease-out group-hover/showcase:scale-105"
                  style={{ backgroundImage: "url('/bg-showcase.png')" }}
                />
                {/* 텍스트 가독성을 위한 다크 오버레이 그라데이션 */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-transparent" />
                
                <div className="relative z-10 grid h-full gap-6 lg:grid-cols-[0.85fr_1fr]">
                  <div className="flex flex-col justify-end">
                    <h3 className="break-keep text-3xl font-black text-white">필지 위험 대시보드</h3>
                    <p className="mt-3 break-keep text-sm leading-6 text-zinc-300">
                      선택한 필지의 위험 점수, 기상 상태, 병해충 후보, 작업 카드를 같은 화면에서 확인합니다.
                    </p>
                  </div>
                  <DashboardPreview />
                </div>
              </article>

              <div className="grid gap-6 lg:col-span-4">
                <RiskSignalMiniUI />
                <PhotoDiagnosisMiniUI />
                <WorkflowMiniUI />
              </div>
            </div>
          </div>
        </section>

        <section id="cta" className="relative flex min-h-[100svh] snap-start items-center overflow-hidden bg-[linear-gradient(180deg,#030704_0%,#07110a_42%,#030403_100%)] px-4 py-24 text-white sm:px-6 lg:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(101,163,13,0.38)_0%,rgba(54,83,20,0.22)_34%,rgba(3,7,4,0)_70%)]" />
          <div className="absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 bg-[linear-gradient(90deg,transparent_0%,rgba(132,204,22,0.12)_18%,rgba(15,107,122,0.08)_50%,rgba(132,204,22,0.12)_82%,transparent_100%)] blur-2xl" />
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(163,230,53,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(163,230,53,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
          <div className="absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-lime-300/50 to-transparent" />
          <div className="absolute inset-x-12 top-[calc(50%-96px)] h-px bg-gradient-to-r from-transparent via-lime-600/30 to-transparent" />
          <div className="absolute inset-x-12 top-[calc(50%+96px)] h-px bg-gradient-to-r from-transparent via-lime-600/30 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.24)_64%,rgba(0,0,0,0.72)_100%)]" />

          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <h2
              aria-label="미래 농업의 기준, 지금 경험하세요."
              className="break-keep text-5xl font-black tracking-normal text-white drop-shadow-[0_16px_42px_rgba(0,0,0,0.55)] sm:text-6xl lg:text-7xl"
            >
              미래 농업의 기준,
              <br />
              지금 경험하세요.
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/dashboard"
                className="inline-flex h-16 w-full items-center justify-center gap-3 rounded-full bg-lime-600 px-9 text-lg font-black text-white shadow-[0_0_46px_rgba(101,163,13,0.34)] transition-transform hover:scale-[1.02] active:scale-[0.98] sm:w-auto"
              >
                대시보드로 시작하기
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function DashboardPreview() {
  return (
    <div className="group relative mx-auto w-full max-w-[320px] h-[240px] overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white/90 backdrop-blur-sm shadow-[0_22px_70px_rgba(9,9,11,0.12)] flex items-center justify-center cursor-crosshair">
      
      {/* 흩어진 데이터 파티클 (Hover 전) */}
      <div className="absolute inset-0 transition-all duration-700 ease-in-out group-hover:scale-150 group-hover:opacity-0 group-hover:blur-md">
        
        {/* 파티클 1: 날씨 */}
        <div className="absolute top-4 left-4 flex flex-col items-center gap-1 text-zinc-400 transition-transform duration-[800ms] group-hover:translate-x-16 group-hover:translate-y-12">
           <span className="text-[9px] font-semibold">단기예보 80%</span>
        </div>
        
        {/* 파티클 2: 해충 */}
        <div className="absolute bottom-5 left-5 flex flex-col items-center gap-1 text-zinc-400 transition-transform duration-[900ms] group-hover:translate-x-16 group-hover:-translate-y-10">
           <span className="text-[9px] font-semibold">진딧물 주의보</span>
        </div>
        
        {/* 파티클 3: 온도/환경 */}
        <div className="absolute top-6 right-5 flex flex-col items-center gap-1 text-zinc-400 transition-transform duration-[850ms] group-hover:-translate-x-16 group-hover:translate-y-10">
           <span className="text-[9px] font-semibold">기온 상승</span>
        </div>
        
        {/* 파티클 4: 맵 */}
        <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 text-zinc-400 transition-transform duration-[750ms] group-hover:-translate-x-16 group-hover:-translate-y-12">
           <span className="text-[9px] font-semibold">김포 토마토 필지</span>
        </div>

        {/* 중앙 유도 텍스트 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full">
           <div className="inline-flex items-center justify-center rounded-full border border-dashed border-zinc-300 bg-white/50 px-3 py-1.5 backdrop-blur-sm">
             <span className="text-[10px] font-bold text-zinc-500 animate-pulse">
                마우스를 올려 데이터 압축
             </span>
           </div>
        </div>
      </div>

      {/* 중앙으로 압축된 통합 카드 (Hover 시 등장) */}
      <div className="absolute scale-50 opacity-0 blur-md transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] delay-100 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0 w-[92%] z-10">
        <div className="rounded-[1.25rem] border border-zinc-100 bg-white/95 backdrop-blur-xl p-4 shadow-[0_30px_60px_rgba(9,9,11,0.12)] relative overflow-hidden">
           
           {/* 빛 번짐 장식 */}
           <div className="absolute -top-10 -right-10 w-24 h-24 bg-orange-500/15 blur-2xl rounded-full" />
           <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-lime-500/15 blur-2xl rounded-full" />
           
           <div className="relative z-10">
             <div className="flex items-start justify-between border-b border-zinc-100/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-[11px] font-black text-zinc-950">오늘의 통합 위험도</div>
                    <div className="text-[9px] font-medium text-zinc-500 mt-0.5">김포 하우스 토마토 기준</div>
                  </div>
                </div>
                <Badge className="rounded-full bg-orange-600 px-2 py-0.5 text-[9px] font-bold text-white hover:bg-orange-600 border-none shadow-sm h-4 leading-none">
                  주의
                </Badge>
             </div>
             
             <div className="pt-3 flex items-end justify-between">
                <div>
                   <div className="text-[8px] font-black tracking-widest text-zinc-400 mb-0.5 uppercase">Score</div>
                   <div className="flex items-baseline gap-0.5">
                      <span className="text-3xl font-black leading-none tracking-tighter text-zinc-900">72</span>
                      <span className="text-[10px] font-bold text-zinc-400">/100</span>
                   </div>
                </div>
                
                <div className="text-right rounded-lg bg-zinc-50 p-2 border border-zinc-100/80">
                   <div className="flex items-center justify-end gap-1 text-[9px] font-black text-orange-600">
                     <CloudSun className="w-2.5 h-2.5" /> 강수·습도 상승
                   </div>
                   <div className="text-[8px] font-semibold text-zinc-500 mt-1 leading-snug break-keep max-w-[100px]">
                     방제 효율이 떨어질 수 있으니 점검 후 작업을 권장합니다.
                   </div>
                </div>
             </div>
           </div>
        </div>
      </div>
      
    </div>
  );
}

function RiskSignalMiniUI() {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-zinc-200 p-6 shadow-sm transition-all hover:shadow-md min-h-[260px]">
      <img 
        src="/risk_signal_ui.png" 
        alt="위험 신호 대시보드" 
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-zinc-950/10" />
      
      <div className="relative z-10 flex items-start justify-between mb-auto">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-black text-white drop-shadow-md">위험 신호 통합</h3>
        </div>
        <Badge className="bg-orange-500 text-white hover:bg-orange-600 border-none px-2.5 shadow-md">주의 1건</Badge>
      </div>

      <div className="relative z-10 mt-auto">
        <p className="mb-3 text-xs leading-5 text-zinc-200 drop-shadow-sm font-medium">
          기상 데이터와 위험 정보를 한 화면에서 파악합니다.
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/60 backdrop-blur-md px-3 py-1.5 text-[11px] font-bold text-white border border-white/10 shadow-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-400" /> 잎곰팡이병 주의보
        </div>
      </div>
    </article>
  );
}

function PhotoDiagnosisMiniUI() {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-zinc-200 p-6 shadow-sm transition-all hover:shadow-md min-h-[260px]">
      <img 
        src="/tomato_leaf_disease.png" 
        alt="병해충 진단 예시" 
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-zinc-950/10" />
      
      {/* Scanning effect */}
      <div className="absolute left-0 right-0 top-0 h-[2px] bg-blue-400 shadow-[0_0_12px_2px_rgba(96,165,250,0.8)] opacity-0 transition-all duration-1000 ease-in-out group-hover:translate-y-[260px] group-hover:opacity-100 z-20" />
      
      {/* Bounding Box UI */}
      <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 h-20 w-24 rounded-lg border-[3px] border-lime-400 bg-lime-400/20 opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-all duration-500 delay-150 group-hover:opacity-100 z-20">
        <div className="absolute -top-7 -left-1 whitespace-nowrap rounded bg-lime-500 px-2 py-0.5 text-[10px] font-black text-white shadow-md flex items-center gap-1">
          잎곰팡이병 88%
        </div>
      </div>

      <div className="relative z-10 flex items-start justify-between mb-auto">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-black text-white drop-shadow-md">사진 기반 진단</h3>
        </div>
      </div>

      <div className="relative z-10 mt-auto">
        <p className="text-xs leading-5 text-zinc-200 drop-shadow-sm font-medium">
          현장 사진으로 진단하고 조치 방법을 확인합니다.
        </p>
      </div>
    </article>
  );
}

function WorkflowMiniUI() {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-zinc-200 p-6 shadow-sm transition-all hover:shadow-md min-h-[260px]">
      <img 
        src="/workflow_ui.png" 
        alt="작업 및 상담 흐름" 
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-zinc-950/10" />
      
      <div className="relative z-10 flex items-start justify-between mb-auto">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-black text-white drop-shadow-md">작업·상담 흐름</h3>
        </div>
      </div>

      <div className="relative z-10 mt-auto">
        <p className="mb-3 text-xs leading-5 text-zinc-200 drop-shadow-sm font-medium">
          처방부터 작업 실행까지 하나의 워크플로우로 연결합니다.
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/60 backdrop-blur-md px-3 py-1.5 text-[11px] font-bold text-white border border-white/10 shadow-lg">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 현장 진단 완료
        </div>
      </div>
    </article>
  );
}
