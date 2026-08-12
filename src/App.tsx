import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import AppLayout from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";

// ── 코드 스플리팅: 모든 페이지를 lazy import ──
const Home = lazy(() => import("./pages/Home"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const FieldsMap = lazy(() => import("./pages/FieldsMap"));
const FieldNew = lazy(() => import("./pages/FieldNew"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Diagnosis = lazy(() => import("./pages/Diagnosis"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

// ── QueryClient 전역 기본값 설정 ──
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5분
      gcTime: 10 * 60 * 1000,   // 10분
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageFallback() {
  return (
    <div className="grid h-full min-h-[200px] place-items-center text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        페이지 로딩 중...
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<AuthPage />} />
              <Route
                element={(
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                )}
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/fields/map" element={<FieldsMap />} />
                <Route path="/fields/new" element={<FieldNew />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/diagnosis" element={<Diagnosis />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
