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

## 구조 (2026-10-15 story 셸로 재구성)
화면 = story 와 같은 레이아웃·클래스명: 헤더(언어·기준·연결 pill·⚙) / [GUIDE 사이드바 + 대화형 작업 로그 | 분할선 | 로그·모델·3D·결과 탭] / 하단 바(버전·테마 navy/light/cyber) / MAPI 드로어.
- `src/styles/app.css` — story `shared/app.css` 사본 + 강구조 3D 토큰(`--p-col/raf/pur/girt/strut`). 색은 전부 테마 토큰. Tailwind(`index.css`)는 유지하되 화면은 app.css 클래스로 그린다.
- `src/state/store.ts` — story 식 mutable `S` + `notify()`/`useStore()`. `ui.ts` — log·addMsg·addPlanMsg·thinking·tab·previewSpec·draw3D.
- `src/agent/` — `guide.ts`(GUIDE 섹션, 문구 키 `g_<sec>_<n>`·`_cmd`), `parse.ts`(로컬 명령 ko/en/zh, 간체→번체 정규화), `session.ts`(send·testConn·setTheme·setCode·runCmd).
- `src/actions/` — `build.ts`(자동저장 → doc/new → 모델·단부해제·하중 PUT → DSTL), `analysis.ts`(자동저장 → doc/anal → 반력 합계), `results.ts`(M2 결과 회수), `design.ts`(M3·M4 실행), `optimize.ts`(단면 최적화 반복), `outputs.ts`(M5 계산서 HTML·M6 DXF).
- `src/domain/` — `portal.ts`(형상: 프레임·2차부재·박공 풍주/거트·X-가새), `gen.ts`(Gen 페이로드), `loads.ts`(하중·조합), `weights.ts`·`sections.ts`(단면 성질), `design.ts`(부재·사용성 검토), `connections.ts`(접합부 자동 산정), `schedule.ts`(물량), `catalog.ts`(CNS2020 후보 단면)·`optimize.ts`(단면 제안, 순수).
- `src/report/report.ts` 계산서, `src/drawing/` DXF(R12) 작성기·시트.
- `src/components/` — Header·Footer·Drawers·Guide·Chat·PlanCard(스펙 편집 카드, 디바운스 3D 미리보기)·Panels(로그·모델·결과)·View3D(Plotly 동적 import).
- `src/mapi/client.ts` — `mapi(method, path, body, note)` 호출·실패를 활동 로그에 기록. `verifyConn()`.
- `api/` — Vercel 서버리스 함수 (`/api/health` 등), `src/lib/api.ts` — 프론트 호출 헬퍼
- `src/components/ui/`·`src/lib/utils.ts` — shadcn(현재 미사용)
- 경로 별칭 `@/` = `src/`
- **자동 저장으로 Gen 확인 창 방지** (`src/actions/save.ts`): `doc/new` 직전(`sms_backup_*`)과 `doc/anal` 직전(`sms_model_*`)에 항상 `doc/saveas {Argument:"<S.saveDir>/sms_<tag>_<YYYYMMDD_hhmmss>.mgbx"}`. 저장 안 된 문서로 해석하면 실패 + Gen 대화상자가 남아 **API 전체가 응답 없음**(2026-10-15 관찰). 폴더 기본 `C:/temp`(Gen PC 기준, 드로어에서 변경, 없으면 "잘못된 경로" 창), 시각을 파일명에 넣어 덮어쓰기 창 회피. 라이브: 생성→해석 연속 2회 창 없이 각 ~10s. 해석 1회당 C:/temp 에 ~10MB(.GAX1) 누적.

## 설계기준·다국어
- **중국(CN) 추가(2026-10-15)**: 전체 흐름 및 적용 제한은 `docs/china_code_implementation.md` 참조. 중국 전용 구현은 `codes/cn*.ts`, `domain/cn*.ts`. 현재 GB 55001/55002 하중계수, GB 50009 풍·적설, GB/T 50011 수평지진, GB 50017-2017 및 GB/T 50018-2025 검토. 공개 Gen 설계 API는 구판이므로 CN에서 DSTL을 보내지 않는다. 모델의 `spec.code`로 검토·출력을 분기하고, 선택 변경 시 새 입력 카드만 해당 국가 기본값으로 초기화한다. TW 수치식·입력 항목을 CN에 적용하지 않는다.
- 국가별 문구는 `tc(code, key)`로 `_CN` 키를 선택한다. UI 언어는 국가와 독립적이다. CN 오프라인 회귀: `node --import tsx scripts/verify-cn.ts`. 라이브: `scripts/live-cn.ts`(키는 stdin, 파일에 저장 금지).
- **코드 프로필** `src/codes/` — `CodeProfile`(재료·하중조합·Gen 연동명). UI 언어와 독립. 기준 추가 = `<id>.ts` + `PROFILES` 한 줄 + `CodeId`. 기준 의존 로직은 `profileOf()`를 거친다.
- **다국어** `src/i18n/` — ko/en/zh-TW/zh-CN. 사전 `dict/en.ts`가 키 기준, 나머지는 `Dict` 타입이라 **키 누락·인자 불일치는 컴파일 오류**. UI 문구는 `t('key')`로만 (인라인 다국어 객체 금지). 언어 추가 = `types.ts` `LANG_DEFS` 한 줄 + 사전 파일.
- 중국어 용어: zh-TW는 대만 규범 용어(屋樑·檁條·牆樑), zh-CN은 대륙 용어(屋面梁·檩条·墙梁). 참고 오라클은 story CLAUDE.md의 i18n 절.

## 원문·Gen NX 참조 자료
- 국가 코드 원문 KB: `E:/MIDAS PROGRAM/COde/{TW,CN,KR,US}/knowledge/` (조항 단위 `chunks.jsonl`). 대만 강구조: `TW/knowledge/steel-design-technical-code`(ASD/LRFD), `steel-construction-code`(施工), `seismic-design-code`, `wind-load-2014`, `building-technical-rules-structure`(冷軋型鋼 포함).
- 하중조합: LRFD 2.2 (2.2-1~2.2-6) 반영 완료.
- Gen NX 설치 폴더에는 강구조 설계 코드 문서 없음 → 위 KB가 원문 출처.
- **Gen NX 라이브 확인(2026-10-14, 대만)**: 설계 코드 `db/DSTL` = `TWN-LSD90`(LRFD)·`TWN-ASD90`; 단면 DB `CNS2020`(최신)·`CNS91` — H형강 `RH 400x200x8x13`(압연)·`BH`(용접), 립 C형강 `CC 150x65x20/3.2`(치수/두께), 각형강관 `B`·`BB`, 원형강관 `P`; 재료 `db/MATL` STEEL `CNS(S)`/`CNS06(S)` DB = SS400·SM400·SM490·SM490Y·SM520·SM570·SN400·SN490 (**SN400B 같은 등급 접미사는 거부** → 프로필 `gen` 매핑).
- **M1 전송 라이브 검증(2026-10-14)**: 샘플 공장(절점 189·요소 332·단면 5·지지 14) UNIT→MATL→SECT→NODE→ELEM→CONS→DSTL 전부 수용, GET 개수 일치, 이후 DELETE 로 원복. 립 C형강 `SHAPE` = `CC`(`C`·`LC` 거부). `db/CONS` `GROUP_NAME` 은 미리 정의된 경계 그룹만 허용 → 생략. 형상→페이로드는 `src/domain/gen.ts`(순수), 전송은 `src/actions/build.ts`. 알려진 단순화: 퍼린 국부축은 경사 지붕 정렬 생략(beta 0), 거트 beta 90.
- **M1.5 하중 라이브 검증(2026-10-14)**: `src/domain/loads.ts` — 케이스 `D`(자중 BODF + 지붕/벽 마감을 퍼린·거트·처마/마루 스트럿에 BMLD)·`LR`(지붕 활하중, 建築技術規則 26조 면적별 표). 조합은 케이스가 있는 것만 생성(현재 2.2-1·2.2-2, 풍·지진 케이스 정의 후 나머지). 해석 `POST doc/ANAL` 성공, 반력표(`post/table` REACTIONG)로 평형 확인: LR 합 847.3 kN = 0.9807×24×36, D 합 492.1 kN ≈ 자중 ~310 + 마감 ~182. 마감 하중 `roofDead` 0.15·`wallDead` 0.10 kN/m² 은 **가정값**. 활하중 면적 저감은 퍼린 기준(≤20 m² → 100 kgf/m²)만 적용 → 프레임에는 보수적.
- **횡하중 라이브 검증(2026-10-15)**: 식 `src/codes/twLateral.ts`(story tw.ts 원문 대조판 기반 + 강구조 값). 지진 = 정적 등가 V = c·W, T = 0.085hn^¾(X 모멘트골조)·0.050hn^¾(Y 가새), hn = 처마+rise/2, R 표1-3(Rx 3.2 部分韌性 鋼 h≤12m, Ry 2.0 同心斜撐 h≤12m), αy 1.0(LRFD 2.2). W = 절점 무게(단면명 치수로 면적 계산 `weights.ts` + 마감) — Gen D 반력 492.12 vs 오프라인 492.68 kN(0.1%). 2.11 분배 w·h → `db/CNLD`. 풍 = MWFRS p = qGCp − q_i(GCpi), 표2.4 벽·표2.5 지붕(θ<10° 이면 h = 처마높이, θ 0~10 은 직선보간, ≤0.3 행의 +0.2/−0.9 두 값 → high/low)·표2.17 ±GCpi → WX1~4, 퍼린·거트에 GX·GZ 선하중. 반력 합 EX 98.552·EY 122.555·WX1~4 FX/FZ 전부 계산값과 일치. 조합 18개(E ±, W 는 케이스가 변형).
- **횡하중 미구현**: 종방향 풍(용마루 평행, 박공벽)·우발편심(2.14)·수직지진(2.18)·대북분지/VM·工址 SDS/SD1 표 조회(현재 샘플 0.6/0.35). W ±(반대 방향)은 대칭 구조라 미러로 대체 — 비대칭 모델이면 추가 필요.
- Gen 오류 메시지는 허용 값 목록을 주지 않는다 — 정확한 문자열은 설치 폴더 `Dbase/*.sdb`·DLL 문자열에서 찾아 시험 PUT 후 DELETE로 원복.

## 전체 프로세스 (2026-10-15 완료, 라이브 검증)
화면 명령 순서: `공장 생성`(스펙 카드 → 실행) → `해석` → `설계 검토` → `계산서` / `도면`. 샘플 1회 전체 ≈ 26 s.
- **모델**: 절점 219·요소 410 (풍주 30·박공 거트 32·가새 16 TRUSS). 퍼린·거트·스트럿 양단 핀(FRLS My·Mz), 풍주 상단 핀. TRUSS 단면은 `USE_WARPING_EFFECT:false` 필수(아니면 "7th DOF" 오류). 가새는 끝에서 두 번째 베이(끝 베이는 박공 프레임 처짐 차로 중력 축력 187 kN 발생 — 라이브).
- **하중**: WY1·2(종방향 풍: 박공 풍상 0.8q(z)·풍하 Cp(L/B)·측벽 −0.7·지붕 −0.7) 추가 → 케이스 10·조합 22. 반력 합 전부 계산값 일치(D 586.4 vs 오프라인 584.7).
- **M2 결과**: `BEAMFORCE`(조합 `(CB)`, PARTS I·1/4·2/4·3/4·J, 410 요소 × 22 조합 ≈ 4.3만 행 11 s), `TRUSSFORCE`, 조합별 반력 합·처마 변위(B2), 사용 하중 변위.
- **M3 부재 검토** `src/codes/twSteel.ts`(LRFD 4.4·4.5·5·6.2·7.2·7.3·8.2 원문식, tf·cm) + `domain/design.ts`. 강축 = 국부 `Moment-y`/`Shear-z`. 교과서 대조: 정렬도 K, Cb(1.667·1.136), φMp. 샘플 최대 0.90(거트), 사용성: 풍 변위각 0.24·지붕보 처짐 0.64.
- **M4 접합부** `src/codes/twConnection.ts`(LRFD 10장: F10T 표10.3-2/3, 앵커 0.75Fu/0.40Fu, 지압 10.9, 필릿 표10.2-5) + `domain/connections.ts`(주각 DG1, 4E 단부판 DG4, 패널존, 스티프너 J10, 가새 볼트). 샘플: 주각 8-M24·PL45 0.97, 처마 8-M22·PL25 + 스티프너 0.98, 마루 8-M20·PL19 0.95.
- **Gen 설계 API**: `post/STEELCODECHECK`·`DESIGN/STEEL/<code>/CODE-ANAL` 은 KDS 만 — TWN 404 → 설계 검토는 자체 구현.
- **M5 계산서**: 10장 HTML(화면 언어), 새 창 → 인쇄 PDF. **M6 DXF**: R12 5시트, ezdxf 검증 오류 0. 문자 ASCII 만.

## 단면 자동 최적화 (2026-10-15, 라이브 검증)
명령 `단면 최적화` (설계 검토 다음). 반복: 결과 회수 → 검토 → `proposeSections` → `sendModel`(재전송) → `analyzeCore`(재해석), 최대 5회.
- 후보 `src/domain/catalog.ts` = 설치본 `Dbase/CNS2020.sdb` 에서 추출한 이름 그대로(RH 150·CC 45·P 60~318.5 40개). 단면적 오름차순, 목표 강도비 0.95, H 세장 단면 제외.
- 2차부재(퍼린·거트·스트럿·풍주·가새)는 핀 → 부재력이 자기 단면과 무관 → 한 번에 확정. 퍼린 처짐 L/360, 가새는 종방향 변위 ∝ 1/A 로 함께 제한.
- 골조: 강도 통과 기둥 × 지붕보 쌍 중 추정 사용성(문형 라멘 횡강성 Chopra 1.3·단부 고정도 처짐식으로 현재 해석값 환산) ≤ 0.95 인 최소 강재량.
- 진동 방지(`OptControl`): 재해석 강도 NG 단면 이하 면적 금지(floors), 사용성 NG 골조 쌍 이하 금지(bans), 실제/추정 강도비로 증폭 학습(amp) → 현재보다 가벼운 후보에만 목표 target/amp.
- **라이브(샘플)**: 2회 해석으로 수렴, 38 s. 45.99 t → 41.61 t (−9.5%): 기둥·지붕보 RH600x200x11x17 → RH596x199x10x15(추정 0.93 → 재해석 0.914, 재분배 작음), 스트럿 → RH194x150x6x9, 가새 → P114.3x3.2. 새 단면명 Gen 수용(오류 0). 최대비 0.914 NG 0, 접합부 재산정 OK(주각 0.97·처마 0.97·마루 0.94).
- 종료: 수렴 / 이미 거친 조합 / 최대 반복. 최종 = 거친 상태 중 NG 0 최경량(현재가 아니면 재전송·재해석). 이후 접합부 재산정, `S.lastSpec` 갱신, 결과 탭·계산서 9장에 변경 전후 표.

## 대만 규범 보완 (2026-10-15, 라이브 검증) — Gen API 로 되는 것 / 웹에서 하는 것
1. **내진 13장** — Gen: `LCOM-GEN` 에 E′ 조합(13.3-1/2, E′ = 1.4·min(Fu,2.5)·E, 방향별 Ω)·중력 조합(13.6.1 1.2D+0.5L) 추가 → 31 조합 수용. 웹: 조합 용도 `info.comboKind`(basic/amplified/gravity) — 일반 부재 검토는 basic 만, 가새 부재·접합 13.8.4 / 주각 13.4.5(보수적으로 P·M·V 전부) 는 E′ 포함, 기둥 13.4.1 축력(Pu/φPn ≤ 0.4 면제), 처마 접합 13.7.2→13.6.1 용량 설계(Mu = 지붕보 Mp, Vu = V(1.2D+0.5L) + 2Mp/Lh ≤ V(13.3-1), θp,req = min(0.01, 1.1(R−1)θE), 공급 회전각은 시험 근거 필요 메모). 샘플 Ω X 3.00·Y 2.14, 처마 8-M27·PL28 + 스티프너 + 더블러 12.
2. **풍 2.10~2.12** — Gen: 케이스 WLX·WLY(횡풍향 0.87(L/B)W_D, 거트 선하중)·WT(비틀림 0.28·max(B·W_D), 측벽 처마 스트럿 ±Y 우력). 조합 = 순풍향 단독 + 0.841·W_D + 0.7(W_L ± W_T) (대칭 → 두 변형). 웹: W_D = 순풍향 케이스 수평 합력, 4.2 변위각도 같은 조합. 샘플 W_D,X 251 / W_L,X 146 / M_T 2535 kN·m.
3. **국부 풍압·냉간성형** — 웹만 (Gen 설계 API 는 KDS 만). `codes/twWindCC.ts`(그림 3.1 = ASCE 7-02 × 2.083, KB 전사값과 일치, 受風面積 L·max(s, L/3), 구역 폭 a, θ ≤ 10° 벽 0.9) → `domain/secondary.ts`(단순보 C&C 조합). `codes/twColdFormed.ts` = AISI S100 유효폭법(B2~B4, C3.1·C3.2·C3.3·C4·C5) — **대만 冷軋型鋼 규범 원문이 KB 에 없어 미대조**. 부압 시 자유 플랜지 LTB(새그로드 간격).
4. **보완** — 표2-1(327)·표2-6(b)·臺北盆地 → `codes/twSites.ts`(자동 생성, 縣市 병합 셀은 공식 鄉鎮 수로 배정·불일치 0), 표2-4 Fa·Fv, 스펙 `seismic.county/town/soil/SMS/SM1`, 근단층(2.4)은 경고만. V_M(2.10.2) 하한·대북분지 Ra(2-11)·V*(2-13b) → 샘플은 **V_M 지배**(X 0.221 > 0.200). 우발 비틀림 2.14 ETX·ETY(0.05·B⊥·V, 스트럿 우력, E 와 같은 부호 조합, 2.16.1 변위에 포함). 두께별 Fy `fyAt`(CNS 통상값, 원문 미대조) — 주각 PL45 → PL50.
- 라이브 결과(샘플): 조합 55·케이스 15, 기존 단면 NG 83(거트 C&C 1.23·풍주 1.17) → 최적화 2회 42.58 t NG 0 → 기본 단면 갱신(거트 CC200x75x20/3.2, 풍주 RH298x149x5.5x8).

## 배포·도메인
**https://steel.midasapi.space** (Vercel 프로젝트 `smart-midas-steel`, repo `Dennis5882/smart-midas-steel` `main` → 자동 배포). 2026-10-15: Cloudflare **DNS only** CNAME `steel` → `9dfc409e370e822e.vercel-dns-017.com` (프록시 켜면 Vercel 인증서 발급 실패 — rebar 와 같은 규칙), `smart-midas-steel.vercel.app` 은 308 → 커스텀 도메인 (Vercel 도메인 설정 `redirect`).

**언어별 공유 링크** (story 와 같은 방식): 빌드 시 `vite.config.ts` langPages 가 `dist/{ko,en,zh-TW,zh-CN}/index.html`(+ 소문자 경로) 생성 — `<title>`·og 메타 = 사전 `meta_title`/`meta_desc`(메신저 미리보기는 JS 미실행이라 정적 메타 필수), 루트 `/` = ko. 시작 언어: 링크 경로·`?lang=` > 저장값(`sms_lang`) > 브라우저. 언어를 바꾸면 주소도 `/<lang>/`(루트에서 ko 는 `/` 유지, `?lang=` 은 경로로 옮김, 해시 보존) — `src/i18n/index.ts` `langUrl`·`syncUrl`. GUIDE 기타 `링크 복사` = 현재 언어 링크를 클립보드로.

## 버전·릴리즈 노트 (사용자 규칙, 2026-10-15 — rebar-repair 와 같은 방식)
**사용자에게 보이는 변경을 푸시할 때마다 버전을 올리고, 그 버전의 릴리즈 노트를 같은 커밋에 넣는다 — 묻지 않고 자동으로.** 커밋 전에 `npm run release -- minor`(새 기능) 또는 `patch`(수정·문구·사용자에게 보이는 문서), `major` 는 사용자가 말할 때만. 스크립트(`scripts/release.mjs`)가 `package.json`(+ lock) version 을 올리고 `src/data/releases.json` 맨 앞에 `{version,date(KST),id,items}` 추가, 네 사전(`src/i18n/dict/*.ts`)의 `@release-notes` 앵커 아래에 빈 키 `rn_<id>_1..N` 을 넣는다 → 노트를 ko 먼저, en·zh-TW·zh-CN 순으로 사용자 언어로 한 줄씩 채운다(항목 수는 `--items N`). `release-check`(= `npm run build` 첫 단계, Vercel 빌드에도 적용)는 package.json version ≠ 최신 항목이거나 노트가 하나라도 비면 실패 — **version·키를 손으로 고치지 말 것**. 내부 변경(테스트·리팩터·CLAUDE.md)만이면 버전업 불필요. 화면: 하단 바 `v{APP_VERSION}`(vite define, package.json 단일 출처) 클릭·GUIDE 도움말·명령 `릴리즈 노트` → `ReleaseNotes.tsx`(`.rn` 모달, `S.rnOpen`). 0.1.0~0.5.0 은 기존 커밋에 소급 번호(모두 2026-10-15).

## 명령
`npm run dev`(프론트) + `npm run dev:api`(백엔드, vercel CLI 필요) / `npm run build`(= release-check + `tsc -b` + `vite build`) / `npm run typecheck` / `npm run release -- patch|minor|major [--items N]`

## 보안·커밋 규칙
1. **MAPI-Key는 코드/커밋에 포함 금지**, 메모리(state)에만 보관 — 저장 금지.
2. 커밋/푸시는 사용자가 명시적으로 요청할 때만.
