import seed from "@/data/tasks.json";

export const STATUSES = ["todo", "doing", "review", "done"] as const;
export type Status = (typeof STATUSES)[number];

export type Task = {
  id: string;
  title: string;
  depends: string[];
  dependsNote?: string;
  paths: string;
  doneWhen: string;
  size: string;
  owner: string;
  status: string;
};

export type Phase = { id: number; name: string; tasks: Task[] };

/** What the tracker stores per task on top of the markdown seed. */
export type TaskEdit = {
  owner?: string;
  status?: Status;
  note?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type Edits = Record<string, TaskEdit>;

export const phases: Phase[] = seed.phases as Phase[];
export const taskIds = new Set(phases.flatMap((p) => p.tasks.map((t) => t.id)));

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function merged(task: Task, edits: Edits) {
  const edit = edits[task.id];
  return {
    ...task,
    owner: edit?.owner ?? task.owner,
    status: (edit?.status ?? (isStatus(task.status) ? task.status : "todo")) as Status,
    note: edit?.note ?? "",
    updatedAt: edit?.updatedAt,
    updatedBy: edit?.updatedBy,
  };
}

export type MergedTask = ReturnType<typeof merged>;
