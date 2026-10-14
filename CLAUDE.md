# CLAUDE.md — Smart MIDAS Steel

## 소통
- **한국어**로 소통. 코드 식별자·API 키워드는 영어 유지.

## 개요
MIDAS Gen 강구조물 자동 모델링 웹앱. 제품 스펙·미정 사항은 README.md.
참고 프로젝트: `E:/AI Study/story` (Gen NX RC 에이전트 — 같은 스택·MAPI 직접 호출 방식).

## 스택
Vite 8 + TypeScript + React 19 + Tailwind v4 + shadcn/ui(new-york) + **Vercel Functions 백엔드(`api/`)**.
- MAPI(로컬 MIDAS Gen) 호출은 **브라우저가 직접**(`midas-nx` SDK) — Vercel 서버는 사용자 PC의 Gen에 접근 불가.
- 백엔드(`api/*.ts`)는 단면·재질 라이브러리, 설계 검토 계산, 보고서 생성 등 Gen과 무관한 일을 담당. 핸들러는 Web 표준 `export function GET(req: Request)` 형식.

## 구조
- `api/` — Vercel 서버리스 함수 (`/api/health` 등), `src/lib/api.ts` — 프론트 호출 헬퍼
- `src/mapi/client.ts` — `MidasClient` 래퍼, `mapi(method, path, body)` (path가 `/`로 시작하지 않으면 `/db/{path}`)
- `src/state/store.ts` — 전역 상태 `S` (baseUrl, mapiKey)
- `src/components/ui/` — shadcn 컴포넌트 (`npx shadcn@latest add <name>`)
- `src/lib/utils.ts` — `cn()`
- 경로 별칭 `@/` = `src/`

## 설계기준·다국어
- **코드 프로필** `src/codes/` — `CodeProfile`(재료·하중조합·Gen 연동명). UI 언어와 독립. 기준 추가 = `<id>.ts` + `PROFILES` 한 줄 + `CodeId`. 기준 의존 로직은 `profileOf()`를 거친다.
- **다국어** `src/i18n/` — ko/en/zh-TW/zh-CN. 사전 `dict/en.ts`가 키 기준, 나머지는 `Dict` 타입이라 **키 누락·인자 불일치는 컴파일 오류**. UI 문구는 `t('key')`로만 (인라인 다국어 객체 금지). 언어 추가 = `types.ts` `LANG_DEFS` 한 줄 + 사전 파일.
- 중국어 용어: zh-TW는 대만 규범 용어(屋樑·檁條·牆樑), zh-CN은 대륙 용어(屋面梁·檩条·墙梁). 참고 오라클은 story CLAUDE.md의 i18n 절.

## 원문·Gen NX 참조 자료
- 국가 코드 원문 KB: `E:/MIDAS PROGRAM/COde/{TW,CN,KR,US}/knowledge/` (조항 단위 `chunks.jsonl`). 대만 강구조: `TW/knowledge/steel-design-technical-code`(ASD/LRFD), `steel-construction-code`(施工), `seismic-design-code`, `wind-load-2014`, `building-technical-rules-structure`(冷軋型鋼 포함).
- 하중조합: LRFD 2.2 (2.2-1~2.2-6) 반영 완료.
- Gen NX 설치 폴더에는 강구조 설계 코드 문서 없음 → 위 KB가 원문 출처.
- **Gen NX 라이브 확인(2026-10-14, 대만)**: 설계 코드 `db/DSTL` = `TWN-LSD90`(LRFD)·`TWN-ASD90`; 단면 DB `CNS2020`(최신)·`CNS91` — H형강 `RH 400x200x8x13`(압연)·`BH`(용접), 립 C형강 `CC 150x65x20/3.2`(치수/두께), 각형강관 `B`·`BB`, 원형강관 `P`; 재료 `db/MATL` STEEL `CNS(S)`/`CNS06(S)` DB = SS400·SM400·SM490·SM490Y·SM520·SM570·SN400·SN490 (**SN400B 같은 등급 접미사는 거부** → 프로필 `gen` 매핑).
- **M1 전송 라이브 검증(2026-10-14)**: 샘플 공장(절점 189·요소 332·단면 5·지지 14) UNIT→MATL→SECT→NODE→ELEM→CONS→DSTL 전부 수용, GET 개수 일치, 이후 DELETE 로 원복. 립 C형강 `SHAPE` = `CC`(`C`·`LC` 거부). `db/CONS` `GROUP_NAME` 은 미리 정의된 경계 그룹만 허용 → 생략. 형상→페이로드는 `src/domain/gen.ts`(순수), 전송은 `src/actions/send.ts`. 알려진 단순화: 퍼린 국부축은 경사 지붕 정렬 생략(beta 0), 거트 beta 90.
- **M1.5 하중 라이브 검증(2026-10-14)**: `src/domain/loads.ts` — 케이스 `D`(자중 BODF + 지붕/벽 마감을 퍼린·거트·처마/마루 스트럿에 BMLD)·`LR`(지붕 활하중, 建築技術規則 26조 면적별 표). 조합은 케이스가 있는 것만 생성(현재 2.2-1·2.2-2, 풍·지진 케이스 정의 후 나머지). 해석 `POST doc/ANAL` 성공, 반력표(`post/table` REACTIONG)로 평형 확인: LR 합 847.3 kN = 0.9807×24×36, D 합 492.1 kN ≈ 자중 ~310 + 마감 ~182. 마감 하중 `roofDead` 0.15·`wallDead` 0.10 kN/m² 은 **가정값**. 활하중 면적 저감은 퍼린 기준(≤20 m² → 100 kgf/m²)만 적용 → 프레임에는 보수적.
- Gen 오류 메시지는 허용 값 목록을 주지 않는다 — 정확한 문자열은 설치 폴더 `Dbase/*.sdb`·DLL 문자열에서 찾아 시험 PUT 후 DELETE로 원복.

## 명령
`npm run dev`(프론트) + `npm run dev:api`(백엔드, vercel CLI 필요) / `npm run build`(= `tsc -b && vite build`) / `npm run typecheck`

## 보안·커밋 규칙
1. **MAPI-Key는 코드/커밋에 포함 금지**, 메모리(state)에만 보관 — 저장 금지.
2. 커밋/푸시는 사용자가 명시적으로 요청할 때만.
