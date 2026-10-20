/* 현지 시각 날짜·시각 — toISOString()(UTC)은 대만·한국 아침에 전날이 되므로 쓰지 않는다. 언어와 무관한 24시간 표기. */
const p = (n: number) => String(n).padStart(2, '0')
export const localDate = (d = new Date()) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
export const clock = (d = new Date()) => `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
