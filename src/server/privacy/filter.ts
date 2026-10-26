// 프라이버시 게이트의 메시지 필터.
// 게이트 on에서는 에이전트(특히 LLM)가 쓴 자유 문장을 내보내지 않는다.
// offer · counter의 reason은 항상 상태 템플릿으로 다시 쓰고, LLM 문장은 판단 신호로만 쓴다.
// 위치어 검사(locationHints)는 라벨 검사 · 리포트 · 테스트용 보조 수단이다. 이것만으로 막는다고 기대하지 않는다.

import type { Presence, Subtask, Task } from '../../shared/contracts.js';
import { findLeaks } from '../../shared/leak.js';
import type { MessageBody } from '../../shared/negotiation.js';
import { counterReason, offerReason } from '../muse/policy.js';
import { PLACE_STEMS, PLACE_WORDS } from './gazetteer.js';

export type Gate = 'on' | 'off';

/** ETA 구간 표현("10분 이내" 등)을 뺀 뒤에도 분 단위 숫자가 남으면 정확한 ETA로 본다 */
const BUCKET = /(?<!\d)(10|20|30)분\s*(이내|넘게)/g;
const EXACT_MINUTES = /\d+\s*(분|min)|\d{1,2}:\d{2}/i;
/** "○○동 · ○○역 · ○○로 · ○○길"처럼 끝나는 단어 (뒤에 조사가 와도 된다) */
const PLACE_SUFFIX = /[가-힣]{2,}(동|역|로|길)(?=$|[\s,.)!?]|[은는이가에을를의서도])/;

/** 우회 문자 정리: 전각 → 반각, 제로폭 · 서식 문자 제거 */
export function clean(text: string): string {
  return text.normalize('NFKC').replace(/\p{Cf}/gu, '');
}

/** clean + 한글 사이 공백 제거 ("망 원 동" → "망원동") */
export function normalize(text: string): string {
  return clean(text).replace(/(?<=[가-힣])\s+(?=[가-힣])/g, '');
}

/** 동 · 구로 끝나는 세 글자 이상 정식 이름은 일상어와 겹치지 않아서, 붙여 쓴 문장에서도 찾는다 */
const FULL_NAMES = PLACE_WORDS.filter((w) => w.length >= 3 && /[동구]$/.test(w));

/** 지명 사전에 있는 단어. 앞에 한글이 붙어 있으면(예: 홍길동) 다른 단어로 본다 */
export function findPlaceWords(text: string): string[] {
  const spaced = clean(text);
  const collapsed = normalize(text);
  return PLACE_WORDS.filter(
    (w) => new RegExp(`(?<![가-힣])${w}`).test(spaced) || (FULL_NAMES.includes(w) && collapsed.includes(w)),
  );
}

/** 위치를 드러내는 표현 목록 (좌표 · 도로명 · 학교명 · 거리 · 지명 · 정확한 ETA) */
export function locationHints(text: string): string[] {
  const hints = [...findLeaks(text), ...findLeaks(normalize(text)), ...findPlaceWords(text).map((w) => `지명: ${w}`)];
  if (EXACT_MINUTES.test(normalize(text).replace(BUCKET, ''))) hints.push('정확한 ETA');
  return [...new Set(hints)];
}

/** 라벨에 흔한 장소 꼴 (노선 · 역 출구 · 시장 · 공원 · 마트 · 아파트 단지 등) */
const LANDMARK = /호선|입구|시장|공원|마트|아파트|단지|타워|병원|숲(?![가-힣])/;

/**
 * 태스크 라벨 검사. 라벨은 사용자가 쓴 자유 문장이라 통지 · 이벤트 로그에 그대로 보이므로 넓게 막는다.
 * 위치 단서 + 동 이름 어간(예: 망원) + "○○동/역/로/길" 꼴 + 장소 꼴 + 로마자.
 * "봉사활동"처럼 '동'으로 끝나는 일상어도 걸리는 오탐은 감수한다.
 */
export function labelHints(label: string): string[] {
  const hints = locationHints(label);
  const t = normalize(label);
  const stem = PLACE_STEMS.find((s) => t.includes(s));
  if (stem) hints.push(`지명 어간: ${stem}`);
  const suffix = PLACE_SUFFIX.exec(clean(label));
  if (suffix) hints.push(`지명 꼴: ${suffix[0]}`);
  const landmark = LANDMARK.exec(clean(label)) ?? LANDMARK.exec(t);
  if (landmark) hints.push(`장소 꼴: ${landmark[0]}`);
  if (/[A-Za-z]/.test(clean(label))) hints.push('로마자');
  return hints;
}

export interface FilterResult {
  body: MessageBody;
  filtered: boolean;
}

/**
 * 게이트 on: offer · counter의 reason을 항상 상태 템플릿으로 다시 쓴다.
 * filtered는 원래 문장이 템플릿과 달랐는지(= 에이전트 문장이 버려졌는지).
 */
export function filterMessage(body: MessageBody, presence: Presence, task: Task): FilterResult {
  if (body.type !== 'offer' && body.type !== 'counter') return { body, filtered: false };
  const find = (id: string) => task.subtasks.find((s) => s.id === id)!;
  const reason =
    body.type === 'offer'
      ? offerReason(presence, find(body.subtask_id))
      : counterReason(presence, find(body.subtask_id), find(body.alternative));
  return { body: { ...body, reason }, filtered: reason !== body.reason };
}

/**
 * 요청자가 위치 설명을 지우고 다시 쓴 라벨 (예: "민아 픽업 (○○동 쪽)" → "민아 픽업").
 * 운영 인박스는 위치가 든 라벨을 거절하므로, 누수 실험의 게이트 on 조건은 이렇게 다시 쓴 라벨로 투입한다.
 */
export function sanitizeLabel(label: string): string {
  const stripped = label.replace(/\s*\([^)]*\)/g, (m) => (labelHints(m).length ? '' : m)).trim();
  return labelHints(stripped).length ? '이름 없는 일' : stripped;
}

export function sanitizeSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((s) => ({ ...s, label: sanitizeLabel(s.label) }));
}
