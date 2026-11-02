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
    title: '좌표 없는 지도',
    focus: 'phones',
    action: 'reset',
    caption: () => '폰마다 자기 상태만 보여요. 엄마는 집, 아빠는 이동 중(약 20분), 형은 집 근처. 지도도 핀도 좌표도 없어요.',
  },
  {
    title: '내 토큰으로는 내 것만',
    focus: 'boundary',
    action: 'boundary',
    caption: () =>
      '에이전트마다 자기 토큰이 하나씩 있어요. 아빠 토큰으로 엄마 상태를 달라고 하면 403, 토큰이 없거나 위조면 401. 방금 서버에 실제로 보낸 요청 결과예요.',
  },
  {
    title: '태스크 투입',
    focus: 'task',
    action: 'task',
    caption: () => '저녁 6시까지 "민아 픽업 + 우유". 한 사람은 한 가지 일만 맡아요.',
  },
  {
    title: 'Muse 3명의 협상',
    focus: 'channel',
    action: 'negotiate',
    caption: () => '각자의 Muse가 자기 상태만 보고 offer → counter → commit을 주고받아요. 오가는 건 메시지뿐, 서로의 위치는 모릅니다.',
  },
  {
    title: 'Muse에게 가는 것',
    focus: 'muse',
    action: 'muse',
    caption: () =>
      '아빠의 Muse가 받는 건 자기 상태 · ETA 구간 · 마감까지 남은 분 · 지금까지의 메시지뿐이에요. 모델은 JSON 하나로 답하고, WRU가 검사한 뒤 협상에 올려요.',
  },
  {
    title: '역할 통지',
    focus: 'roles',
    action: 'none',
    caption: ({ state }) => {
      const n = state.negotiations.at(-1);
      const task = state.tasks.find((t) => t.task_id === n?.task_id);
      const roles = n?.assignment.assignments
        .map((a) => `${{ mom: '엄마', dad: '아빠', sibling: '형' }[a.person]} = ${task?.subtasks.find((s) => s.id === a.subtask)?.label}`)
        .join(', ');
      return `결과는 역할만: ${roles ?? '—'}. 사람이 한 번 승인하면 각자 자기 역할만 받아요.`;
    },
  },
  {
    title: '로그로 집을 찾을 수 있을까?',
    focus: 'report',
    action: 'leak',
    conditions: ['on'],
    caption: ({ report }) =>
      report
        ? `같은 협상 로그를 적대자에게 주고 집 · 학교가 서울 25개 구 중 어디인지 ${report.trials}번 맞히게 했어요. 집 ${pct(report.gates.on.home_rate)}, 학교 ${pct(report.gates.on.school_rate)}. 우연(${pct(report.chance)})과 비슷해요.`
        : '누수 테스트를 불러오는 중…',
  },
  {
    title: '게이트를 끄면',
    focus: 'report',
    action: 'none',
    conditions: ['off', 'filter_only', 'on'],
    caption: ({ report }) =>
      report
        ? `에이전트가 동네 이름 · 거리 · 정확한 ETA를 그대로 말하게 두면 집 ${pct(report.gates.off.home_rate)}, 학교 ${pct(report.gates.off.school_rate)}까지 맞혀요. WRU는 그 문장을 내보내지 않습니다.`
        : '',
  },
];
