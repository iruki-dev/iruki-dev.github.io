const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n: number) => String(n).padStart(2, '0');
// 콘텐츠 날짜는 UTC 자정으로 들어온다. 그대로 UTC 기준으로 읽는다.
export const ymd = (d: Date) => `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}`;
export const ymdLong = (d: Date) => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
export const ym = (d: Date) => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
export const md = (d: Date) => `${d.getUTCMonth() + 1}.${p2(d.getUTCDate())}`;
export const dayNum = (d: Date) => d.getUTCDate();
export const dow = (d: Date) => DAYS[d.getUTCDay()];
