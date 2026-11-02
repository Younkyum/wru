// 서울 25개 구 공개 지명 사전. 누수 실험(시나리오 · 적대자)과 메시지 필터가 쓴다.
// 위치는 시청 기준 대략의 km 격자(동 +x, 북 +y)로만 둔다. 위경도는 쓰지 않는다.
// 이 값은 실험 · 필터 내부에서만 쓰고 API · 로그 · UI로 내보내지 않는다.

export interface District {
  name: string;
  short: string;
  x: number;
  y: number;
  dongs: [string, string];
}

export const DISTRICTS: District[] = [
  { name: '종로구', short: '종로', x: 0, y: 2, dongs: ['혜화동', '평창동'] },
  { name: '중구', short: '중구', x: 1, y: 0, dongs: ['신당동', '회현동'] },
  { name: '용산구', short: '용산', x: 0, y: -4, dongs: ['이태원동', '한남동'] },
  { name: '성동구', short: '성동', x: 5, y: -2, dongs: ['성수동', '왕십리동'] },
  { name: '광진구', short: '광진', x: 9, y: -3, dongs: ['자양동', '구의동'] },
  { name: '동대문구', short: '동대문', x: 5, y: 2, dongs: ['회기동', '장안동'] },
  { name: '중랑구', short: '중랑', x: 9, y: 4, dongs: ['면목동', '상봉동'] },
  { name: '성북구', short: '성북', x: 2, y: 5, dongs: ['정릉동', '돈암동'] },
  { name: '강북구', short: '강북', x: 2, y: 9, dongs: ['미아동', '수유동'] },
  { name: '도봉구', short: '도봉', x: 3, y: 13, dongs: ['창동', '방학동'] },
  { name: '노원구', short: '노원', x: 7, y: 11, dongs: ['상계동', '중계동'] },
  { name: '은평구', short: '은평', x: -6, y: 6, dongs: ['불광동', '응암동'] },
  { name: '서대문구', short: '서대문', x: -4, y: 2, dongs: ['연희동', '홍제동'] },
  { name: '마포구', short: '마포', x: -6, y: -1, dongs: ['망원동', '합정동'] },
  { name: '양천구', short: '양천', x: -13, y: -4, dongs: ['목동', '신정동'] },
  { name: '강서구', short: '강서', x: -16, y: -1, dongs: ['화곡동', '등촌동'] },
  { name: '구로구', short: '구로', x: -12, y: -8, dongs: ['개봉동', '고척동'] },
  { name: '금천구', short: '금천', x: -9, y: -12, dongs: ['독산동', '시흥동'] },
  { name: '영등포구', short: '영등포', x: -7, y: -5, dongs: ['여의도동', '당산동'] },
  { name: '동작구', short: '동작', x: -4, y: -8, dongs: ['상도동', '흑석동'] },
  { name: '관악구', short: '관악', x: -4, y: -11, dongs: ['봉천동', '신림동'] },
  { name: '서초구', short: '서초', x: 3, y: -10, dongs: ['반포동', '방배동'] },
  { name: '강남구', short: '강남', x: 7, y: -8, dongs: ['역삼동', '대치동'] },
  { name: '송파구', short: '송파', x: 12, y: -8, dongs: ['잠실동', '가락동'] },
  { name: '강동구', short: '강동', x: 15, y: -3, dongs: ['천호동', '길동'] },
];

export const DISTRICT_NAMES = DISTRICTS.map((d) => d.name);

export function districtOf(name: string): District | undefined {
  return DISTRICTS.find((d) => d.name === name);
}

export function distanceKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 동 이름 → 구 */
export function districtOfDong(dong: string): District | undefined {
  return DISTRICTS.find((d) => d.dongs.includes(dong));
}

/** 일상어와 겹치는 짧은 이름은 사전에서 뺀다 (예: 동작 = 움직임) */
const NOT_PLACE_WORDS = new Set(['중구', '동작']);

/** 지명 사전: 구 이름, 짧은 구 이름(두 글자 이상), 동 이름 */
export const PLACE_WORDS: string[] = [
  ...new Set(
    DISTRICTS.flatMap((d) => [d.name, ...(d.short.length >= 2 && !NOT_PLACE_WORDS.has(d.short) ? [d.short] : []), ...d.dongs]),
  ),
].sort((a, b) => b.length - a.length);

/** 동 이름에서 '동'을 뗀 두 글자 이상 어간 (예: 망원). 라벨 검사 · 적대자가 쓴다 */
export const PLACE_STEMS: string[] = [
  ...new Set(DISTRICTS.flatMap((d) => d.dongs.map((dong) => dong.slice(0, -1)).filter((s) => s.length >= 2))),
];

/** 로마자 지명 (구 · 동 어간). 영어 라벨 검사에 쓴다 */
export const ROMAN_STEMS: string[] = [
  'Jongno', 'Jung-gu', 'Yongsan', 'Seongdong', 'Gwangjin', 'Dongdaemun', 'Jungnang', 'Seongbuk', 'Gangbuk', 'Dobong',
  'Nowon', 'Eunpyeong', 'Seodaemun', 'Mapo', 'Yangcheon', 'Gangseo', 'Guro', 'Geumcheon', 'Yeongdeungpo', 'Dongjak',
  'Gwanak', 'Seocho', 'Gangnam', 'Songpa', 'Gangdong',
  'Hyehwa', 'Pyeongchang', 'Sindang', 'Hoehyeon', 'Itaewon', 'Hannam', 'Seongsu', 'Wangsimni', 'Jayang', 'Guui',
  'Hoegi', 'Jangan', 'Myeonmok', 'Sangbong', 'Jeongneung', 'Donam', 'Mia', 'Suyu', 'Chang-dong', 'Banghak',
  'Sanggye', 'Junggye', 'Bulgwang', 'Eungam', 'Yeonhui', 'Hongje', 'Mangwon', 'Hapjeong', 'Mokdong', 'Sinjeong',
  'Hwagok', 'Deungchon', 'Gaebong', 'Gocheok', 'Doksan', 'Siheung', 'Yeouido', 'Dangsan', 'Sangdo', 'Heukseok',
  'Bongcheon', 'Sillim', 'Banpo', 'Bangbae', 'Yeoksam', 'Daechi', 'Jamsil', 'Garak', 'Cheonho', 'Gil-dong',
  'Seoul', 'Hongdae', 'Sinchon', 'Itaewon', 'Myeongdong', 'Euljiro', 'Teheran',
];
