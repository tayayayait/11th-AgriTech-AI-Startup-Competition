export type TaskStatus = "pending" | "in_progress" | "done" | "deferred" | "cancelled";

export interface TaskCheck {
  label: string;
  done: boolean;
}

export interface TaskSource {
  name: string;
  collectedAt?: string;
  url?: string;
}

export interface TaskCard {
  id: string;
  field_id: string | null;
  priority: number;
  title: string;
  reason: string | null;
  duration_min: number | null;
  due_at: string | null;
  checks: TaskCheck[];
  sources: TaskSource[];
  status: TaskStatus;
  completed_at: string | null;
}
