// 프라이버시 게이트의 메시지 필터.
// 에이전트(특히 LLM)가 쓴 reason에 위치어나 정확한 분 단위 ETA가 섞이면 상태 템플릿으로 바꾼다.

import type { Presence, Subtask, Task } from '../../shared/contracts.js';
import { findLeaks } from '../../shared/leak.js';
import type { MessageBody } from '../../shared/negotiation.js';
import { counterReason, offerReason } from '../muse/policy.js';
import { PLACE_WORDS } from './gazetteer.js';

export type Gate = 'on' | 'off';

/** ETA 구간 표현("10분 이내" 등)을 뺀 뒤에도 분 단위 숫자가 남으면 정확한 ETA로 본다 */
const BUCKET = /(10|20|30)분 (이내|넘게)/g;
const EXACT_MINUTES = /\d+\s*분/;

export function findPlaceWords(text: string): string[] {
  return PLACE_WORDS.filter((w) => text.includes(w));
}

/** 위치를 드러내는 표현 목록 (좌표 · 도로명 · 학교명 · 거리 · 지명 · 정확한 ETA) */
export function locationHints(text: string): string[] {
  const hints = [...findLeaks(text), ...findPlaceWords(text).map((w) => `지명: ${w}`)];
  if (EXACT_MINUTES.test(text.replace(BUCKET, ''))) hints.push('정확한 ETA');
  return hints;
}

export interface FilterResult {
  body: MessageBody;
  filtered: boolean;
}

/** 게이트 on: offer · counter의 reason을 검사해 위치 단서가 있으면 템플릿으로 교체 */
export function filterMessage(body: MessageBody, presence: Presence, task: Task): FilterResult {
  if (body.type !== 'offer' && body.type !== 'counter') return { body, filtered: false };
  if (locationHints(body.reason).length === 0) return { body, filtered: false };
  const find = (id: string) => task.subtasks.find((s) => s.id === id)!;
  const reason =
    body.type === 'offer'
      ? offerReason(presence, find(body.subtask_id))
      : counterReason(presence, find(body.subtask_id), find(body.alternative));
  return { body: { ...body, reason }, filtered: true };
}

/** 게이트 on: 라벨 괄호 속 위치 설명을 지운다 (예: "민아 픽업 (○○동 쪽)" → "민아 픽업") */
export function sanitizeLabel(label: string): string {
  const stripped = label.replace(/\s*\([^)]*\)/g, (m) => (locationHints(m).length ? '' : m)).trim();
  return locationHints(stripped).length ? '이름 없는 일' : stripped;
}

export function sanitizeSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((s) => ({ ...s, label: sanitizeLabel(s.label) }));
}
