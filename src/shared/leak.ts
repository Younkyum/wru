// 위치 누수 패턴. API 응답 · 로그 · UI · 샘플 · 에이전트 문구 검사에 같이 쓴다.

export interface LeakRule {
  name: string;
  pattern: RegExp;
}

export const LEAK_RULES: LeakRule[] = [
  { name: 'lat', pattern: /\blat\b/i },
  { name: 'lng', pattern: /\b(lng|lon)\b/i },
  { name: 'latitude/longitude', pattern: /\b(latitude|longitude)\b/i },
  // 필드 이름만 잡는다 (영어 문장 속 "no coordinates"는 허용)
  { name: 'coords', pattern: /coords?\b|["']coordinates["']\s*:/i },
  { name: '위도/경도', pattern: /위도|경도/ },
  { name: '소수점 좌표', pattern: /-?\d{1,3}\.\d{3,}/ },
  { name: '좌표 쌍', pattern: /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/ },
  // "퇴근길 20분"처럼 숫자 바로 뒤에 시간 단위(+공백 · 조사)가 오면 도로명이 아니다. "58 분수대"는 도로명으로 본다
  { name: '도로명 주소', pattern: /[가-힣0-9]+(대로|로|길)\s?\d+(?!\d*\s?(분|초|시간?)(\s|$|[,.)이에은는도만]))(번길|-\d+)?/ },
  { name: '번지', pattern: /\d+\s?번지/ },
  { name: '학교 고유명', pattern: /[가-힣A-Za-z]{2,}(초등학교|중학교|고등학교|초교|중교|고교)/ },
  { name: '학교 약칭', pattern: /[가-힣]{2,}(초|중|고)\s?(앞|정문|후문|근처)/ },
  { name: '역 이름', pattern: /[가-힣]{2,}역(?![가-힣])/ },
  { name: 'street address', pattern: /\b\d+\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Ln|Lane|Dr|Drive)\b/ },
  { name: 'school name', pattern: /\b[A-Z][a-z]+\s+(Elementary|Middle|High)(\s+School)?\b/ },
  { name: 'station name', pattern: /\b[A-Z][a-z]+\s+(Station|Stn)\b/ },
  { name: '거리', pattern: /\d+(\.\d+)?\s?(km|㎞|킬로|미터|miles?|meters?)\b|\d+\s?m\b/i },
];

export function findLeaks(text: string): string[] {
  return LEAK_RULES.filter((r) => r.pattern.test(text)).map((r) => `${r.name}: ${text.match(r.pattern)?.[0]}`);
}
