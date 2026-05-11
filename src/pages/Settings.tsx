import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogOut, Plus, Trash2, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useSelectedField } from "@/context/SelectedFieldContext";
import { deleteField } from "@/services/fieldService";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserPreferences,
  saveNotificationSettings,
  type UserNotificationSettings,
} from "@/services/userPreferencesService";

export default function Settings() {
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const { fields, refetch } = useSelectedField();
  const { data: preferences } = useQuery({
    queryKey: ["user-preferences", user?.id],
    enabled: !!user,
    queryFn: getUserPreferences,
  });
  const notificationSettings = preferences?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;

  const saveNotifications = useMutation({
    mutationFn: saveNotificationSettings,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-preferences", user?.id] });
      toast.success("알림 설정을 저장했습니다.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "알림 설정을 저장하지 못했습니다.");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "로그아웃하지 못했습니다.");
    },
  });

  async function remove(id: string) {
    try {
      await deleteField(id);
    } catch (error) {
      if (error instanceof Error) return toast.error(error.message);
      return toast.error("필지 삭제 중 오류가 발생했습니다.");
    }

    toast.success("필지를 삭제했습니다.");
    refetch();
  }

  function updateNotificationSetting(key: keyof UserNotificationSettings, checked: boolean) {
    saveNotifications.mutate({
      ...notificationSettings,
      [key]: checked,
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">필지 관리</CardTitle>
          <Button asChild size="sm">
            <Link to="/fields/new"><Plus className="mr-1 h-3.5 w-3.5" /> 새 필지</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {fields.map((f) => {
            const cropName = f.crop_name.trim() || "작물 미입력";
            const address = f.address?.trim() || "주소 없음";

            return (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="max-w-full rounded-sm px-1.5 py-0 text-[11px] font-medium">
                      <span className="truncate">작물: {cropName}</span>
                    </Badge>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{address}</span>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => remove(f.id)} aria-label="삭제">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {fields.length === 0 && <p className="text-sm text-muted-foreground">등록된 필지가 없습니다.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">알림 설정</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Row
            label="강수/강풍 위험 알림"
            checked={notificationSettings.weatherRisk}
            disabled={saveNotifications.isPending}
            onCheckedChange={(checked) => updateNotificationSetting("weatherRisk", checked)}
          />
          <Row
            label="병해충 발생정보 알림"
            checked={notificationSettings.pestRisk}
            disabled={saveNotifications.isPending}
            onCheckedChange={(checked) => updateNotificationSetting("pestRisk", checked)}
          />
          <Row
            label="작업 카드 리마인더"
            checked={notificationSettings.taskReminder}
            disabled={saveNotifications.isPending}
            onCheckedChange={(checked) => updateNotificationSetting("taskReminder", checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">계정</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UserCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.email ?? "이메일 정보 없음"}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.id ?? "사용자 ID 없음"}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
