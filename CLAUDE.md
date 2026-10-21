# CLAUDE.md — Smart MIDAS Steel

MIDAS Gen NX 단층 강구조 공장 자동 모델링·해석·설계 검토 웹앱 (TW·CN·KR 기준, ko/en/zh-TW/zh-CN). 배포 <https://steel.midasapi.space> (repo `Dennis5882/smart-midas-steel` `main` → Vercel 자동 배포).

이 파일은 **매 세션 읽는 규칙과 현재 사실**만 담는다. 날짜별 구현·라이브 수치 기록은 [docs/reference/implementation-log.md](docs/reference/implementation-log.md)(2026-10-22 까지 이 파일에 있던 원문)와 주제별 `docs/reference/*.md` 에 있다. 세부가 필요하면 그 문서를 검색한다.

## 소통

- **한국어**로 답한다(사용자가 중국어로 써도). 코드 식별자·API 키워드는 영어.
- 대만 공유 문서는 번체(zh-TW, 대만 규범 용어 屋樑·檁條·牆樑), 간체 문서는 대륙 용어(屋面梁·檩条·墙梁).

## 반드시 지킬 규칙

1. **MAPI-Key**: 코드·커밋·출력·명령 인자·다른 파일에 넣지 않는다. 앱은 메모리(state)에만. 라이브 스크립트는 gitignore 된 루트 `.env` 의 `MAPI_KEY=` 를 `scripts/mapi-key.ts` 로 읽는다(stdin → env → .env). 커밋 전 staged diff 키 검사.
2. **커밋·푸시는 사용자가 명시적으로 요청할 때만.** 내가 만들지 않은 파일은 커밋하지 않는다 — 현재 `docs/china-market-steel-design-strategy.md`, `docs/taiwan_factory_steel_wizard_localization_review.md`, `docs/20230113024231-範例_天車梁移動載重模擬.pdf`.
3. **버전**: 사용자에게 보이는 변경을 푸시할 때마다 묻지 않고 `npm run release -- patch --items N` → 같은 커밋에 4개 언어 릴리즈 노트(ko 먼저, en·zh-TW·zh-CN). **patch 만**, minor 는 먼저 상의, major 는 사용자가 말할 때만. version·노트 키를 손으로 만들지 않는다. 내부 변경(테스트·리팩터·문서)만이면 버전업 없음. 상세는 아래 「버전·릴리즈」.
4. **커밋 전 `npm run verify`**(오프라인 33종, ~200 s, Gen·키 불필요) 통과.
5. **라이브 Gen 안전**(사용자 PC 의 Gen 을 직접 조작):
   - 항상 `node --import tsx scripts/live-guarded.ts -- <스크립트> [인자]` — 열린 원본 문서를 저장하고 끝나면 다시 열어 12 DB 해시 일치를 확인한다. 결과에 "restored original: 12 DB hashes match" 가 없으면 사용자에게 보고.
   - **다른 작업이 Gen 을 쓰는 중이면 멈춘다**: `C:/temp` 에 최근 10분 안에 `sf_*`·`gen_rc_temp_*` 파일이 생겼으면 실행하지 않는다(사용자가 "지금 해도 됨"이라고 하면 진행). 긴 실행은 백그라운드로.
   - `doc/new`·`doc/anal` 직전 항상 자동 저장(`actions/save.ts`), raw `doc/anal` 금지 — 저장 안 된 문서로 해석하면 Gen 대화상자가 떠 API 전체가 멈춘다.
6. UI 문구는 `t('key')` 만(인라인 다국어 금지), 새 오류에 영어 문장 하드코딩 금지 — 식별자를 담은 오류 클래스 + `job.failText` 번역(`rv_*`·`q_invalid` 방식).
7. 원문 근거가 없는 규범 값·해석은 만들지 않는다. 불확실하면 등급을 `expert`/`prelim` 으로 두고 사유를 남긴다. **'모두 OK' 문구 금지**(등급 요약).

## 문서 지도

- `docs/README.md` 시작점 · `docs/current-status.md` 지원 상태(**v2.4.1 기준 — 갱신 필요**) · `docs/roadmap.md` 미완료 R01~R11.
- `docs/reference/` — 기능별 상세 규칙: 추가 구조 1~4·5·6단계(`factory-additions-*`), NG 보완(`ng-section-remediation`), 크레인 구간(`crane-travel-range`), 단면 성질 출처(`gen-section-property-source` — 옛 근사식 설명보다 우선), CN(`china_code_implementation`)·KR(`korea_code_implementation`)·TW 냉간(`taiwan_cold_formed_review`), 모델링 7단계 UX(`modeling-additional-structures-ux`), Gen 하중 읽어 오기 계획(`gen-readback-scope`), 구현 기록(`implementation-log`). 사용자 원안 `gen_nx_factory_structural_modifier_architecture.md` 는 원문 보존.
- `docs/archive/2026-10-19/` 완료·대체된 계획 — 미완료 목록·수치를 현재 상태로 재사용하지 않는다.
- 대만 현지: `docs/taiwan-meeting-2026-10-20.md`(회의 — 모델링 호평, 자동 하중·계산서 불신, 단계형 흐름·Gen 결과 읽어 오기 요청), `docs/taiwan-local-engineer-review-questions.md`(질문지).
- 산출물 공유본은 `output/`(gitignore): `output/gen-models/`(대만 기본 모델 6개·Word), `output/taiwan/`(번체 설명서).
- 원문 KB: `E:/MIDAS PROGRAM/COde/{TW,CN,KR,US}/knowledge/`(조항 단위 `chunks.jsonl`). TW: `steel-design-technical-code`·`seismic-design-code`·`wind-load-2014`·`building-technical-rules-structure`(冷軋型鋼 포함) 등. Gen 설치 폴더에는 설계 코드 문서 없음.
- 참고 프로젝트 `E:/AI Study/story`(같은 스택·셸, Gen RC 에이전트).

## 스택·구조

Vite 8 + TypeScript + React 19 + Tailwind v4(화면은 `src/styles/app.css` 클래스·테마 토큰) + Vercel Functions(`api/`, Gen 무관 작업). **MAPI 호출은 브라우저가 직접**(`midas-nx` 2.10.2) — 서버는 사용자 PC 의 Gen 에 접근 불가. 별칭 `@/` = `src/`.

| 위치 | 역할 |
|---|---|
| `state/store.ts` | mutable `S` + `notify()`/`useStore()` (story 방식). `Built`(보낸 스펙·모델·`sent` 페이로드·`modelOnly`) |
| `state/taskFlow.ts` | 모델링 → 해석 → 설계 검토 → 최적화(선택) → 산출물 단계 상태·실행 가능 여부(`unavailable`), `specChanged` |
| `actions/` | `build`(자동저장 → doc/new → PUT → 전송 확인) · `analysis` · `results`(회수·검증·`checkResults`) · `design` · `optimize` · `remediation` · `outputs` · `genSync`(Gen 동일성) · `job`(진행·취소·중복 거부) · `save` |
| `domain/` (순수) | `portal`(형상) · `gen`(Gen 페이로드) · `loads`/`cnLoads`/`krLoads`(하중·조합) · `design`·`connections`(검토) · `optimize`·`catalog` · `scope`(적용범위 block/warn) · `status`(등급) · `genSync`(비교기) · `additions*` · `pedestal` · `windSummary` · `quantities` |
| `codes/` | 기준 프로필 `CodeProfile`(`profileOf()` 경유) + 국가별 원문 식(`tw*`·`cn*`·`kr*`). 기준 추가 = `<id>.ts` + `PROFILES` 한 줄 |
| `components/` | `Workspace`·`TaskNav`·`TaskStage` · `PlanCard`/`ModelWizard`(7단계, `modelingFlow.ts` 상수·`STEP_CAM`) · `planFields.ts`(칸 정의·검증, 기본/자유골조 공통) · `View3D`(Plotly) · `WindPreview` · `HelpDialog`(사용안내·릴리즈 노트) |
| `report/` | `report.ts` 계산서 HTML → `pdf.ts`(pdfmake)·`docx.ts`·`xlsx.ts`, `drawing/` DXF·SVG 공용 시트 |
| `i18n/` | ko/en/zh-TW/zh-CN, `dict/en.ts` 가 키 기준 — 누락·인자 불일치는 컴파일 오류. 국가별 문구 `tc(code, key)` → `_CN` 키 |
| `mapi/client.ts` | `mapi(method, path, body, note)` — 활동 로그·진행 단계·취소·대기 한도(`timeoutFor`) |

화면: 헤더(언어·연결) / [GUIDE | 작업 화면 | 로그·모델·3D·결과 탭] / 하단 바(버전·테마). 기본 모델링 = 템플릿 마법사 7단계(시작 → 횡단면 → 길이·베이 → 재료·단면 → 추가 구조 → 지역·하중 → 최종 확인), 자유골조 = 한 화면 편집(`bayList`).

## Gen MAPI 규칙 (라이브로 확인한 것 — 어기면 실패)

- **문서 초기화는 `doc/new`**(항목별 DELETE 안 씀). 전체 표 DELETE 는 SDK 가 `confirm: true` 없으면 거부.
- 대기 한도 `timeoutFor`: `/doc/anal`·`/post/TABLE`·KDS 강재 설계 실행/표 15분, 그 밖 `/doc/*`·`/DESIGN/*` 3분, 나머지 1분(경로 대소문자·끝 '/'·쿼리 무관). 초과는 `gen_timeout`(Gen 대화상자 확인 안내).
- 결과 표 본문은 `tableOf(응답)` — Gen 이 최상위 키를 TABLE_NAME 대신 'Result Table'·'empty' 로 줄 때가 있다. 큰 배열에 `push(...arr)`·`Math.max(...arr)` 금지(브라우저 스택 초과 — BEAMFORCE 10만+ 행), 조회는 Set.
- 전송 후 11개 DB 를 다시 읽어 개수·ID·보낸 필드 값 비교(`domain/genSync`, 허용오차 1e-9, Gen 이 붙이는 필드·ELEM NODE 0 채움·ITEMS 순서 허용). 해석·검토·최적화 직전 13개 DB 동일성 검사(`assertGenSync`) — 다르면 막고 차이 목록, 자동 재생성 안 함. 단면 A/I/J 는 SECTIONALL 표와 대조(다르면 생성 차단).
- 페이로드 규칙: TRUSS 단면 `USE_WARPING_EFFECT:false`, **TRUSS 요소에 보 하중 불가**(절점으로), **한 절점·같은 케이스 CNLD 항목은 합산해 하나로**, **조합 이름 ≤ 20자**, `db/CONS` 의 `GROUP_NAME` 생략, 재료 등급 접미사 거부(SN400B → 프로필 `gen` 매핑), 립 C `SHAPE 'CC'`, 사각 RC `SHAPE 'SB'` `vSIZE` 10칸.
- 설계 API: TW 미지원(404) → 앱 자체 검토. CN 은 구판이라 DSTL 안 보냄. KR KDS(`DESIGN/STEEL/DSTL`·`post/STEELCODECHECK`)는 **라이브 대조용만**(`live-kr.ts --gen-check`).
- 화면: 생성 후 `view/ANGLE`(H30·V15) + `view/CAPTURE ZOOM_LEVEL 100`(맞춤 전용 API 없음), 해석 후 `view/RESULTGRAPHIC` 반력 표시. 실패해도 생성은 성공.
- 이동하중: `MVCD TAIWAN` 거부 → `AASHTO STANDARD` + 사용자 차량. 면 풍압(Wind Pressure 메뉴)·`SWIND` Taiwan 은 API 없음, `PNLA` 는 판 요소 전용 → 보에는 `FBLD`/`FBLA`(경계가 모두 보여야 함). 상세: implementation-log 「Gen 이동하중」「Gen 면 풍압」.
- 오류 메시지는 허용 값을 알려 주지 않는다 — 정확한 문자열은 설치 폴더 `Dbase/*.sdb`·DLL 문자열에서 찾고 시험 PUT 으로 확인.

## 기준별 현재 상태 (요약 — 상세는 reference 문서)

- **공통**: 대칭 축소·거울상 조합 없음(사용자 결정 2026-10-20 '실무대로') — Gen 에 보낸 조합 = 앱이 검토하는 조합. 기본 모델 케이스·조합: **TW 21·155, KR 31·204, CN 17·87**. 결과 등급 `fail > expert > prelim > reinforced > pass`, 계산 주체(해석 = Gen 선형 정적 / 검토 = 앱) 표시. 적용범위 `scope.ts` block 이면 생성 거부, warn 은 최소 `expert`.
- **TW**(LRFD 鋼結構極限設計法規範, ASD 선택): 2.2 조합, 耐風規範 2014(鄉鎮별 V10, 表2.8 다경간, 횡풍향·비틀림, 높이별 풍압 표, 지형계수 `wind.Kzt` 기본 1), 耐震規範 113(표2-1 工址·근단층·V_M·우발 비틀림·13장 E′·13.6.1 용량 설계 — 처마 회전 능력은 시험 근거 필요라 TW 기본은 항상 `expert`), 강종 10종·2차 재료, 립 C/Z 냉간(`prelim`), 트러스 지붕·한 지붕 다경간·강접 내부 기둥, 독립기초 예비검토, RC 받침(`spec.pedestal`, Gen 탄성 보로 모델링). 판본 라벨 96年修正·99年部分修正, 建築技術規則 構造編 112年.
- **CN**: GB 51022-2015 门式刚架(풍 μw·β, 적설 표 4.3.2) + GB 55001 계수 + GB 50017-2017 부재 + GB/T 50018-2025 냉간, GB/T 50011 지진. 선택 라벨 `GB 51022`. 간체 UI 는 CN 만, API 서버 `moa-engineers.midasit.cn`.
- **KR**: KDS 41 30 10 → 14 31 10/15(LRFD, 유효길이법 + 가상하중), 하중 KDS 41 12 00, 지진 41 17 00 + 17 10 00(행정구역 → 지진구역), 외장재 C&C·접합(14 31 25)·립 C 냉간·지진력저항시스템 OMF/OCBF. H ≥ 20 m·편지붕 > 30° block.
- **기준 ↔ 언어**: 새 작업은 언어 우선(zh-TW → TW, zh-CN → CN 만, ko → KR, en 은 저장값 유지), 작업 중 언어 변경은 기준 유지(`store.codeForLang`).
- 형식: 박공·편경사(`mono`)·다경간(`multi`, 내부 = 흔들림 기둥)·한 지붕 다경간(`gableCols`)·트러스(TW). 내부 기둥 형식 + 크레인 = block. 추가 구조(크레인·플랫폼·설비·개구부·연결부)는 출처 확인 후 예비검토.

## 진행 중·계획 (2026-10-22)

- **Gen 전송 내용 선택**: 7단계 `GenContentPicker` — 정상 / 모델 + 자중만(`selfWeightOnly` → STLD·BODF 만, 해석·검토·최적화 `flow_model_only` 차단, 산출물 허용). 라이브 확인 2026-10-22(기본·RC 받침 모두 통과). `runAnalysis`·`runDesignCheck`·`runOptimize` 진입점은 화면 버튼과 같은 `taskFlow.unavailable` 을 호출(규칙 출처 하나), 하중 페이로드·자중 케이스는 `buildEpoch` 올리기 전에 확인(실패해도 편집기 안 잠김), 모델 탭 `model_only_tag`(미리보기 중엔 `model_only_preview_tag`)·계산서 3·4장 안내, 선택은 편집기 메시지 + `S.activePlan.modelOnly`. 3D 시점: 사용자가 단계를 옮기면(오류 단계로 되돌아감 포함) `STEP_CAM`, 새 편집기는 첫 단계 시점, 재개·결과 [수정] 이동은 보던 시점 유지.
- **Gen 엔지니어 하중 읽어 오기**: 계획만(`docs/reference/gen-readback-scope.md`, 대만 공유 번체 Word `output/taiwan/Gen讀回工程師載重_流程說明.docx`). 사용자 요청 없이 구현 시작하지 않는다.
- 보류(사용자 결정): 케이스 결과만 회수해 앱에서 조합(속도), 동일성 검사 대상 확대(회의 F2 와 함께), RC 받침 + 추가 구조, Kzt 표 2.3 자동, FBLA 면 하중 옵션.

## 검증

- `npm run verify`(`scripts/verify-all.mjs`, 33종, `--stack-size=500` 으로 브라우저 수준 스택). 개별 실행 `node --import tsx scripts/verify-<name>.ts`.
- 정답 세트(라이브 Gen 결과) `scripts/fixtures/{tw,cn,kr}-sample.json.gz` → `verify-tw.ts`/`verify-golden.ts`. 설계식을 의도적으로 바꾸면 `verify-tw.ts --update`, 형상·하중을 바꾸면 라이브 재캡처(`capture-tw-golden.ts [--code CN|KR]`, `live-gen-section-baseline.ts`).
- 가짜 Gen 은 `scripts/fake-gen.ts`(fetch 대체). 화면 없는 실행은 `setConfirmHandler(() => true)`, Node 에서 i18n 을 import 하려면 먼저 `globalThis.document = { documentElement: { lang: 'ko', dataset: {} } }`.
- 라이브 스크립트(`live-guarded.ts` 로 감싸서): `live-tw.ts`(`--frame mono|multi|gableCols|truss`, `--pedestal h,b,d`, `--optimize`, `--out`), `live-cn.ts`, `live-kr.ts`(`--gen-check`), `live-additions.ts --phase5|--phase6`, `live-tw-materials.ts`, `live-tw-options.ts`, `live-country-frames.ts`, `live-crane-movingload.ts`, `live-wind-floorload.ts`. 계산서 양식만 고칠 땐 `report-from-summary.ts <summary.json> <out.html> [lang]`.
- 화면 확인이 필요한 변경(입력·3D·대화상자)은 브라우저에서 직접 확인하고 확인한 범위를 보고한다.

## 개발 함정

- 날짜는 `lib/date.ts`(현지 시각) — `toISOString` 금지. 알림 시각은 24시간.
- 계산서 PDF 글꼴은 축소본(`public/fonts/report-{kr,tc,sc}.otf`) — 새 글자가 생기면 `verify-pdf` 가 실패 → `python scripts/subset-fonts.py <원본 Noto OTF 폴더>`. 아래첨자 숫자(₀₁₂)·～·糙 등 글꼴에 없는 글자 주의. 도면(DXF·도면 PDF) 글자는 ASCII.
- 릴리즈 노트 값은 작은따옴표 문자열 — 안에 `'` 를 쓰면 `release-check` 실패(’ 를 쓰거나 피한다).
- Windows 콘솔(CP949): 한글이 든 Python heredoc 은 `python -X utf8`, 큰 다국어 치환은 Edit 도구. 저장소는 LF, `core.autocrlf=true` 라 작업 사본은 CRLF 일 수 있다 — 파일을 쓸 때 기존 줄끝을 따르고(`newline=''` 로 읽어 판별) **CR 단독 줄끝을 만들지 않는다**(섞이면 git 이 정규화하지 않아 파일 전체가 CRLF 로 커밋된다, 2026-10-21 verify-job.ts).
- `results` 객체는 회수 뒤 바꾸지 않는다(검증 WeakMap·재사용 지문). 부재·접합 검토는 `checkResults(b, r)` 한 경로.
- `Status.tsx` 는 계산서·작업 모듈도 쓰므로 `agent/session` 을 가져오지 않는다. 대화상자는 네이티브 `<dialog>` showModal.
- 채팅 메시지는 `lt(key, …args)` 로 저장(그릴 때 현재 언어). zh-TW 사전(릴리즈 노트 제외)에 대륙 용어 금지(회귀 검사).
- 매뉴얼에 버튼 이름을 쓰면 실제 사전 값과 맞춘다.
- 단면 성질은 `sectionProps(name, code)` — 이름이 같은 TW/KR 강관도 Gen DB 값이 달라 **생산 계산에서 code 를 생략하지 않는다**(생략·`dimensionSectionProps` 는 도형·손계산용). Gen DB 값과 앱 근사를 '같음'·'설계 OK' 로 표시하지 않는다.
- 모델링 입력: 지역·하중 변경은 추가 구조의 출처 확인을 풀지 않고, 형상·간격·재료·단면 변경은 푼다. 요소 분할 시 `physicalKey`·`designLength` 보존, 추가 부재는 `Element.addition` 으로 기존 부재와 분리, 하중 전달용 가상 부재(`loadOnly`)는 Gen 에 보내지 않는다.
- 크레인을 받는 기둥은 흔들림 기둥 금지(강접) — `scope.ts`·`verify-frames` 가 지킨다.

## 버전·릴리즈

`npm run release -- patch [--items N]` 이 `package.json`(+lock) version, `src/data/releases.json` 맨 앞 항목(date = KST 'YYYY-MM-DD HH:mm'), 네 사전 `@release-notes` 앵커 아래 빈 키 `rn_<id>_1..N` 을 만든다 → 노트를 채운다. 자릿수는 0~9, 10 이면 윗자리로 자동. `release-check`(= `npm run build` 첫 단계, Vercel 빌드 포함)가 version 불일치·빈 노트를 막는다. 화면: 하단 `v{APP_VERSION}` → `HelpDialog` 릴리즈 탭.

## 명령

`npm run dev`(프론트) + `npm run dev:api`(vercel CLI) / `npm run build` / `npm run typecheck` / `npm run verify` / `npm run release -- patch --items N`.

## 배포

Cloudflare **DNS only** CNAME `steel` → Vercel(프록시 켜면 인증서 발급 실패). `smart-midas-steel.vercel.app` 은 308 → 커스텀 도메인. 언어별 공유 링크 `dist/{ko,en,zh-TW,zh-CN}/index.html`(정적 og 메타 = `meta_title`/`meta_desc`), 시작 언어는 경로·`?lang=` > 저장값 > 브라우저.

## 기록 규칙

- 새 기능의 규칙·한계는 해당 `docs/reference/<주제>.md` 에, 날짜별 구현·라이브 수치는 `docs/reference/implementation-log.md` 에 추가한다. 이 파일에는 **앞으로 모든 세션이 지켜야 할 규칙·현재 사실**만 짧게 고친다(낡은 사실은 지우거나 바꾼다 — 덧붙이지 않는다).
- 라이브 결과는 날짜·스크립트·핵심 수치·API 오류 수·12 DB 복원 일치 여부를 함께 적는다. 확인하지 못한 것은 '미확인'으로 적는다.
