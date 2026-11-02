// 데모 모드 7컷. 화면 카피는 docs/COPY.md에도 모아 둔다.

import type { DemoState } from '../shared/contracts';
import type { Condition, LeakReport } from '../shared/leak-report';

/** 컷마다 강조할 화면 영역 */
export type PanelName = 'phones' | 'boundary' | 'task' | 'channel' | 'muse' | 'roles' | 'report';

/** 컷에 들어갈 때 서버에 하는 일 */
export type StepAction = 'reset' | 'boundary' | 'task' | 'negotiate' | 'muse' | 'leak' | 'none';

export interface DemoStep {
  title: string;
  caption: (ctx: { state: DemoState; report: LeakReport | null }) => string;
  focus: PanelName;
  action: StepAction;
  /** 누수 패널에서 보여 줄 조건 */
  conditions?: Condition[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Status only',
    focus: 'phones',
    action: 'reset',
    caption: () => 'Each phone shows only its own status. Mom is home, Dad is on the way (about 20 min), Brother is near home. No map, no pins, no coordinates.',
  },
  {
    title: 'A task comes in',
    focus: 'task',
    action: 'task',
    caption: () => 'By 6 pm: "Pick up Mina + buy milk". One task per person.',
  },
  {
    title: 'Three Muses negotiate',
    focus: 'channel',
    action: 'negotiate',
    caption: () => "Each Muse looks only at its own status and trades offer → counter → commit. Only messages travel; nobody learns anyone's location.",
  },
  {
    title: 'What the model sees',
    focus: 'muse',
    action: 'muse',
    caption: () =>
      "Dad's Muse sends only its own state, an ETA range, minutes to the deadline and the messages so far. The model answers with one JSON object, which WRU checks before it joins the negotiation.",
  },
  {
    title: 'Only roles come out',
    focus: 'roles',
    action: 'none',
    caption: ({ state }) => {
      const n = state.negotiations.at(-1);
      const task = state.tasks.find((t) => t.task_id === n?.task_id);
      const roles = n?.assignment.assignments
        .map((a) => `${{ mom: 'Mom', dad: 'Dad', sibling: 'Brother' }[a.person]} = ${task?.subtasks.find((s) => s.id === a.subtask)?.label}`)
        .join(', ');
      return `Only roles come out: ${roles ?? '—'}. After one human approval, each person gets only their own role.`;
    },
  },
  {
    title: 'Nobody can peek',
    focus: 'boundary',
    action: 'boundary',
    caption: () =>
      "Could one agent peek at another? Every agent holds its own token: Dad's token asking for Mom's status gets 403; no token or a forged one gets 401. These are real requests just sent to the server.",
  },
  {
    title: 'Can the log reveal home?',
    focus: 'report',
    action: 'leak',
    conditions: ['off', 'on', 'filter_only'],
    caption: ({ report }) =>
      report
        ? `With the privacy gate off, all ${report.gates.off.distinct_logs} logs differ and a simple attacker finds the home ${pct(report.gates.off.home_rate)} of the time. With it on, ${report.trials} families produce ${report.gates.on.distinct_logs} distinct logs: even with every answer known, ${pct(report.gates.on.bound_home_rate)} is the ceiling, which is what the status alone reveals. An agent that secretly knows its location produces the very same logs.`
        : 'Loading the leak test…',
  },
];
