// 시연용 토큰 경계표 (/api/demo/boundary)

import type { PersonId } from './contracts';

export interface BoundaryRow {
  /** 토큰을 든 쪽: 구성원, 토큰 없음, 위조 토큰 */
  holder: PersonId | 'none' | 'forged';
  /** 앞부분만 보이는 토큰 표시 (원문 아님) */
  token: string | null;
  cells: { target: PersonId; status: number }[];
}

export interface BoundaryMatrix {
  rows: BoundaryRow[];
}
