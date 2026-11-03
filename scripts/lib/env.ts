// 스크립트용: .env가 있으면 읽는다 (서버는 셸 환경을 그대로 쓴다)
import { existsSync } from 'node:fs';

export function loadEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
