// 태스크 인박스 (메모리 저장).

import { findLeaks } from '../shared/leak.js';
import { SUBTASK_KINDS, findForbiddenKey, type Subtask, type Task, type TaskConstraints } from '../shared/contracts.js';

export interface TaskInput {
  task_id?: string;
  /** ISO8601 또는 로컬 "HH:MM" */
  deadline: string;
  subtasks: Subtask[];
  constraints?: Partial<TaskConstraints>;
}

export type SubmitResult = { ok: true; task: Task } | { ok: false; error: string };

export const HERO_TASK: TaskInput = {
  task_id: 't_pickup_milk_001',
  deadline: '18:00',
  subtasks: [
    { id: 'pickup', label: '민아 픽업', kind: 'pickup' },
    { id: 'milk', label: '우유 사기', kind: 'errand' },
  ],
  constraints: { max_subtasks_per_person: 1 },
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;
const ID = /^[a-z0-9_]{1,64}$/;

export class TaskInbox {
  private tasks: Task[] = [];
  private seq = 0;

  constructor(
    private readonly isoAt: (minuteOfDay: number) => string,
    private readonly now: () => string,
  ) {}

  submit(input: unknown): SubmitResult {
    const forbidden = findForbiddenKey(input);
    if (forbidden) return { ok: false, error: '태스크에 위치 필드를 넣을 수 없어요.' };
    if (!input || typeof input !== 'object') return { ok: false, error: '태스크 형식이 아니에요.' };
    const body = input as Partial<TaskInput>;

    let deadline: string;
    const hhmm = typeof body.deadline === 'string' ? HHMM.exec(body.deadline) : null;
    if (hhmm) deadline = this.isoAt(Number(hhmm[1]) * 60 + Number(hhmm[2]));
    else if (typeof body.deadline === 'string' && ISO.test(body.deadline)) deadline = body.deadline;
    else return { ok: false, error: 'deadline은 "HH:MM" 또는 ISO8601이어야 해요.' };

    if (!Array.isArray(body.subtasks) || body.subtasks.length === 0) {
      return { ok: false, error: 'subtasks가 비어 있어요.' };
    }
    const subtasks: Subtask[] = [];
    for (const s of body.subtasks) {
      if (!s || typeof s.id !== 'string' || !ID.test(s.id) || typeof s.label !== 'string' || !s.label.trim()) {
        return { ok: false, error: 'subtask에는 id와 label이 필요해요.' };
      }
      if (findLeaks(s.label).length) return { ok: false, error: 'subtask 이름에 위치 정보를 넣을 수 없어요.' };
      if (subtasks.some((x) => x.id === s.id)) return { ok: false, error: `subtask id가 겹쳐요: ${s.id}` };
      if (s.kind !== undefined && !(SUBTASK_KINDS as readonly string[]).includes(s.kind)) {
        return { ok: false, error: 'subtask kind는 pickup 또는 errand여야 해요.' };
      }
      subtasks.push(s.kind ? { id: s.id, label: s.label.trim(), kind: s.kind } : { id: s.id, label: s.label.trim() });
    }

    const max = body.constraints?.max_subtasks_per_person ?? null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      return { ok: false, error: 'max_subtasks_per_person은 1 이상의 정수여야 해요.' };
    }

    this.seq += 1;
    let task_id = body.task_id ?? `t_${String(this.seq).padStart(3, '0')}`;
    if (!ID.test(task_id)) return { ok: false, error: 'task_id 형식이 올바르지 않아요.' };
    if (this.get(task_id)) task_id = `${task_id}_${this.seq}`;

    const task: Task = {
      task_id,
      deadline,
      subtasks,
      constraints: { max_subtasks_per_person: max },
      received_at: this.now(),
    };
    this.tasks.push(task);
    return { ok: true, task };
  }

  list(): Task[] {
    return [...this.tasks];
  }

  get(task_id: string): Task | undefined {
    return this.tasks.find((t) => t.task_id === task_id);
  }

  clear(): void {
    this.tasks = [];
    this.seq = 0;
  }
}
