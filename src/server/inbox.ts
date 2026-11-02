// 태스크 인박스 (메모리 저장).

import { labelHints } from './privacy/filter.js';
import { SUBTASK_KINDS, findForbiddenKey, isPersonId, type PersonId, type Subtask, type Task, type TaskConstraints } from '../shared/contracts.js';

export interface TaskInput {
  task_id?: string;
  /** ISO8601 또는 로컬 "HH:MM" */
  deadline: string;
  subtasks: Subtask[];
  constraints?: Partial<TaskConstraints>;
  requested_by?: PersonId;
}

export type SubmitResult = { ok: true; task: Task } | { ok: false; error: string };

export const HERO_TASK: TaskInput = {
  task_id: 't_pickup_milk_001',
  deadline: '18:00',
  subtasks: [
    { id: 'pickup', label: 'Pick up Mina', kind: 'pickup' },
    { id: 'milk', label: 'Buy milk', kind: 'errand' },
  ],
  constraints: { max_subtasks_per_person: 1 },
  requested_by: 'mom',
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
    if (forbidden) return { ok: false, error: 'A task cannot carry location fields.' };
    if (!input || typeof input !== 'object') return { ok: false, error: 'Not a task object.' };
    const body = input as Partial<TaskInput>;

    let deadline: string;
    const hhmm = typeof body.deadline === 'string' ? HHMM.exec(body.deadline) : null;
    if (hhmm) deadline = this.isoAt(Number(hhmm[1]) * 60 + Number(hhmm[2]));
    else if (typeof body.deadline === 'string' && ISO.test(body.deadline)) deadline = body.deadline;
    else return { ok: false, error: 'deadline must be "HH:MM" or ISO 8601.' };

    if (!Array.isArray(body.subtasks) || body.subtasks.length === 0) {
      return { ok: false, error: 'subtasks is empty.' };
    }
    const subtasks: Subtask[] = [];
    for (const s of body.subtasks) {
      if (!s || typeof s.id !== 'string' || !ID.test(s.id) || typeof s.label !== 'string' || !s.label.trim()) {
        return { ok: false, error: 'Each subtask needs an id and a label.' };
      }
      if (labelHints(s.label).length) return { ok: false, error: 'A subtask label cannot contain location details.' };
      if (subtasks.some((x) => x.id === s.id)) return { ok: false, error: `Duplicate subtask id: ${s.id}` };
      if (s.kind !== undefined && !(SUBTASK_KINDS as readonly string[]).includes(s.kind)) {
        return { ok: false, error: 'subtask kind must be pickup or errand.' };
      }
      subtasks.push(s.kind ? { id: s.id, label: s.label.trim(), kind: s.kind } : { id: s.id, label: s.label.trim() });
    }

    if (body.requested_by !== undefined && !isPersonId(String(body.requested_by))) {
      return { ok: false, error: 'requested_by must be mom, dad or sibling.' };
    }
    const max = body.constraints?.max_subtasks_per_person ?? null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      return { ok: false, error: 'max_subtasks_per_person must be an integer of at least 1.' };
    }

    this.seq += 1;
    let task_id = body.task_id ?? `t_${String(this.seq).padStart(3, '0')}`;
    if (!ID.test(task_id)) return { ok: false, error: 'Invalid task_id.' };
    if (this.get(task_id)) task_id = `${task_id}_${this.seq}`;

    const task: Task = {
      task_id,
      deadline,
      subtasks,
      constraints: { max_subtasks_per_person: max },
      received_at: this.now(),
      ...(body.requested_by !== undefined ? { requested_by: body.requested_by } : {}),
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
