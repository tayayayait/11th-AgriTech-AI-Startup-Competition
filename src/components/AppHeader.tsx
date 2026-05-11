import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { RefreshCw, UserCircle } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useSelectedField } from "@/context/SelectedFieldContext";

export function AppHeader() {
  const { user } = useAuth();
  const { fields, selectedId, setSelectedId, selected, refetch } = useSelectedField();
  const updatedLabel = selected
    ? format(new Date(selected.updated_at), "M월 d일 HH:mm", { locale: ko })
    : "—";
  const today = format(new Date(), "yyyy년 M월 d일 (EEE)", { locale: ko });

  return (
    <header className="flex h-16 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger />
      <div className="hidden text-sm text-muted-foreground sm:block">{today}</div>
      <div className="ml-auto flex items-center gap-2">
        <Select
          value={selectedId ?? ""}
          onValueChange={(value) => {
            if (value) setSelectedId(value);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="필지 선택" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} · {f.crop_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="hidden md:inline-flex">
          마지막 갱신 {updatedLabel}
        </Badge>
        <Badge variant="secondary" className="hidden max-w-[220px] gap-1 truncate md:inline-flex">
          <UserCircle className="h-3.5 w-3.5" />
          <span className="truncate">{user?.email ?? "로그인"}</span>
        </Badge>
        <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="동기화">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
