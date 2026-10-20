/* 골조 쌍 탐색 회귀 — 가지치기 탐색(searchFramePair: 무게 break·필요할 때만 강도)이 예전 전수 탐색과 같은 쌍·svcLimited 를 내는지.
   무작위 사례(후보 수·무게·금지·강도·강성·접합 판정)로 비교 — 정답 세트 없이 빠르게, 경계(동률 무게·전부 탈락·빈 목록) 포함.
   실행: node --import tsx scripts/verify-opt-search.ts */
import assert from 'node:assert/strict'
import { searchFramePair, type FramePairOps } from '../src/domain/optimize'

/** 예전 전수 탐색 그대로 — 강도 통과 목록을 먼저 만들고 모든 쌍을 본다 */
function exhaustive(cols: string[], rafs: string[], o: FramePairOps) {
  let best: { c: string; r: string; t: number } | null = null
  let svcLimited = false
  for (const c of cols.filter(o.colPasses)) for (const r of rafs.filter(o.rafPasses)) {
    if (o.banned(c, r)) continue
    const t = o.tons(c, r)
    if (best && t >= best.t) continue
    if (o.stiffFails(c, r)) { svcLimited = true; continue }
    if (!o.connOK(c, r)) continue
    best = { c, r, t }
  }
  return { best, svcLimited }
}

/* 재현 가능한 난수 (mulberry32) */
let seed = 20261020
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const int = (n: number) => Math.floor(rnd() * n)

/** 오름차순 무게 (동률 포함) */
const weights = (n: number) => { const w: number[] = []; let x = 1; for (let i = 0; i < n; i++) { x += rnd() < 0.2 ? 0 : int(5) + 1; w.push(x) } return w }

let cases = 0, found = 0, limited = 0
for (let k = 0; k < 4000; k++) {
  const nc = int(9), nr = int(9)
  const cols = Array.from({ length: nc }, (_, i) => `C${i}`), rafs = Array.from({ length: nr }, (_, i) => `R${i}`)
  const wc = weights(nc), wr = weights(nr)
  const p = { col: rnd(), raf: rnd(), stiff: rnd(), conn: rnd(), ban: rnd() * 0.5 }
  const colOK = new Map(cols.map((c) => [c, rnd() < p.col])), rafOK = new Map(rafs.map((r) => [r, rnd() < p.raf]))
  /* 강성은 무거울수록 통과하기 쉽게 (실제처럼), 금지는 가벼운 쪽 사각형 (실제 bans 규칙) */
  const stiffCut = rnd() * (nc + nr)
  const banC = int(nc + 1) - 1, banR = int(nr + 1) - 1
  /* 쌍별 판정은 미리 뽑아 둔다 — 두 탐색이 묻는 순서와 무관하게 같은 값 */
  const stiffRnd = cols.map(() => rafs.map(() => rnd() < p.stiff * 0.3)), connRnd = cols.map(() => rafs.map(() => rnd() < p.conn))
  const idx = (s: string) => +s.slice(1)
  const ops: FramePairOps = {
    tons: (c, r) => wc[idx(c)] + wr[idx(r)],
    banned: (c, r) => p.ban > 0.1 && idx(c) <= banC && idx(r) <= banR,
    stiffFails: (c, r) => idx(c) + idx(r) < stiffCut || stiffRnd[idx(c)][idx(r)],
    colPasses: (c) => colOK.get(c)!, rafPasses: (r) => rafOK.get(r)!,
    connOK: (c, r) => connRnd[idx(c)][idx(r)],
  }
  const a = searchFramePair(cols, rafs, ops), b = exhaustive(cols, rafs, ops)
  assert.deepEqual(a, b, `case ${k}: ${JSON.stringify({ wc, wr, colOK: [...colOK], rafOK: [...rafOK], stiffCut, banC, banR })}`)
  cases++; if (a.best) found++; if (a.svcLimited) limited++
}
assert.ok(found > 500 && limited > 500 && found < cases, `coverage: found ${found}, svcLimited ${limited}`)
console.log(`Frame pair search: ${cases} random cases match exhaustive search (pair found ${found}, svcLimited ${limited})`)
