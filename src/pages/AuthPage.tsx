import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, Sprout } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

type AuthMode = "signin" | "signup";

interface LocationState {
  from?: {
    pathname?: string;
    search?: string;
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "로그인 처리 중 오류가 발생했습니다.";
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("dbcdkwo629@naver.com");
  const [password, setPassword] = useState("12341234");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectPath = useMemo(() => {
    const state = location.state as LocationState | null;
    const pathname = state?.from?.pathname ?? "/dashboard";
    const search = state?.from?.search ?? "";
    return `${pathname}${search}`;
  }, [location.state]);

  useEffect(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, [mode]);

  if (!isLoading && user) {
    return <Navigate to={redirectPath} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNoticeMessage(null);

    if (!email.trim()) {
      setErrorMessage("이메일을 입력하세요.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn({ email, password });
        navigate(redirectPath, { replace: true });
        return;
      }

      const result = await signUp({
        email,
        password,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      });

      if (result.needsEmailConfirmation) {
        setNoticeMessage("가입 확인 메일을 확인한 뒤 다시 로그인하세요.");
        return;
      }

      navigate(redirectPath, { replace: true });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-[420px]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sprout className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">FieldGuard AI</CardTitle>
              <p className="text-xs text-muted-foreground">Supabase 계정 로그인</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="fieldguard-email">이메일</Label>
              <Input
                id="fieldguard-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="farmer@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fieldguard-password">비밀번호</Label>
              <Input
                id="fieldguard-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>

            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>인증 실패</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {noticeMessage && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>확인 필요</AlertTitle>
                <AlertDescription>{noticeMessage}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full" type="submit" disabled={submitting || isLoading}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "로그인" : "회원가입"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {mode === "signin" ? "계정이 없습니까?" : "이미 계정이 있습니까?"}
            </span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "회원가입" : "로그인"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
