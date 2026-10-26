// 데모 이벤트 로그. 상태·태스크 요약만 남기고 위치 상세는 쓰지 않는다.

import type { LogEntry, LogKind } from '../shared/contracts.js';

export class EventLog {
  private entries: LogEntry[] = [];
  private seq = 0;

  constructor(private readonly now: () => string) {}

  add(kind: LogKind, text: string): LogEntry {
    this.seq += 1;
    const entry = { id: this.seq, at: this.now(), kind, text };
    this.entries.push(entry);
    return entry;
  }

  list(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
