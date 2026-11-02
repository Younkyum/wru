// 데모 모드 8컷. 화면 카피는 docs/COPY.md에도 모아 둔다.

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
    title: 'A map without coordinates',
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
    title: 'What goes to the model',
    focus: 'muse',
    action: 'muse',
    caption: () =>
      "Dad's Muse sends only its own state, an ETA range, minutes to the deadline and the messages so far. The model answers with one JSON object, which WRU checks before it joins the negotiation.",
  },
  {
    title: 'Roles, not locations',
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
    conditions: ['on'],
    caption: ({ report }) =>
      report
        ? `${report.trials} scenarios produce only ${report.gates.on.distinct_logs} distinct logs, so even picking answers in hindsight tops out at home ${pct(report.gates.on.bound_home_rate)}, school ${pct(report.gates.on.bound_school_rate)} (chance ${pct(report.chance)}). The rule-based adversary hit home ${pct(report.gates.on.home_rate)}, school ${pct(report.gates.on.school_rate)}.`
        : 'Loading the leak test…',
  },
  {
    title: 'Same log, even if it knows',
    focus: 'report',
    action: 'none',
    conditions: ['off', 'filter_only', 'on'],
    caption: ({ report }) =>
      report
        ? `Slip the location to an agent and the log is still identical to gate on (${report.gates.filter_only.distinct_logs} distinct logs). Turn the gate off and all ${report.gates.off.distinct_logs} logs differ; the same adversary hits home ${pct(report.gates.off.home_rate)}, school ${pct(report.gates.off.school_rate)}.`
        : '',
  },
];
