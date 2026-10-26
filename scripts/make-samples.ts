// 샘플 협상 로그 JSON 생성: npm run samples
import { writeFileSync } from 'node:fs';
import { heroSample } from '../src/server/samples.js';

const sample = await heroSample();
writeFileSync('samples/negotiation-hero.json', `${JSON.stringify(sample, null, 2)}\n`);
console.log('samples/negotiation-hero.json 저장');
