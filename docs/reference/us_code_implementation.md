# 미국 기준(US, AISC 360-22 · ASCE 7-22) 구현 계획

> 계획서 · 2026-11-01 작성, 코드 미착수. 사용자 검토 후 「사용자 결정 필요」를 정하고 1단계(US-1)에 들어간다.
> KR 구현([korea_code_implementation.md](korea_code_implementation.md))과 같은 구조로 간다 — 부재·접합 검토는 앱 자체 계산, Gen 강재 설계는 라이브 대조용.

## 사용자 결정 (2026-11-01)

- US 기준을 **설계기준 드롭다운의 한 항목으로 추가**한다. 화면 언어와 묶지 않는다 — `store.codeForLang` 규칙은 바꾸지 않는다
  (영어 화면은 지금처럼 고른 기준 유지, 한국어 → KR · 번체 → TW · 간체 → CN 만은 그대로). 영어 화면의 기본 기준을 US 로 바꾸는 일은 하지 않는다.
- ASCE 7-22 그림 계수(그림 27.3-1·28.3-1, 30장 외장재) 전사는 **Codex 가 맡는다**(아래 US-0).
- 계획서를 먼저 쓰고 검토 후 코드.

## 판 묶음

| 분야 | 기준 | 원문 KB (`E:/MIDAS PROGRAM/COde/US/knowledge/`) | 비고 |
|---|---|---|---|
| 하중·조합·풍·적설·지진 | **ASCE/SEI 7-22** | `asce-7-22` (4,042 청크, 식 545개 원문 대조, 표 64종 셀 대조) | 원본 PDF 는 개인 구매본(personal use only) — 결정 필요 ④ |
| 강재 부재·접합 | **AISC 360-22** (2025 개정본) | `aisc-360-22` (1,201) | LRFD 기본, ASD 는 후순위 |
| 내진 상세 | AISC 341-16 (참고) | `aisc-341-16` | ASCE 7-22 는 341-22 를 참조 — 판 불일치, US-1 은 341 상세가 필요 없는 시스템만 |
| 기초·앵커 | ACI 318M-19 (또는 318M-25) | `aci-318m-19`, `aci-318m-25` (part = `code`) | US-2, 판은 결정 필요 ⑥ |
| 냉간 성형 | AISI S100 | **없음** | 앱 검토 불가 — Gen `AISI-CFSD08` 대조만 |
| 건축법 | IBC | `ibc-2015` 만 (ASCE 7-10·360-10 참조 판) | 판 묶음과 안 맞아 근거로 쓰지 않음(참고만) |
| 베이스플레이트 | AISC Design Guide 1 | 없음 | 판 두께는 `expert` (KR 과 같은 처리) |

## 확정된 Gen NX 사실 (라이브 2026-10-28, `scripts/live-us-probe.ts`, implementation-log 「US 기준 준비」)

| 항목 | 내용 |
|---|---|
| 재료 `MATL` | `ASTM(S)`: A36·A992·A572-42/50·A529-50·A588-50·A500-46/50·A53 / `ASTM09(S)`: A36·A992·A572-50·A500-46/50·A913-50·A1011-33/50/55·A847. A500 은 항복강도 표기(Gr.B = `A500-46`, Gr.C = `A500-50`). **재료 이름 ≤ 16자**. Gen 은 E 만 채움(199,948 MPa = 29,000 ksi) |
| 단면 `SECT` DBUSER | `AISC10(SI)`·`AISC10(US)`: W(SHAPE `H`)·각형 HSS(`B`)·원형 HSS(`P`)·C(`C`)·L(`L`), SI 이름 `W310X38.7`·`HSS203.2X203.2X9.5`·`HSS168.3X7.1`. **`AISC16` 은 API 거부**(설치 폴더 `Dbase/AISC16(SI).sdb` 는 있음 — MIDAS 문의 대상). `AISI08(US)` 냉간 Z/ZS/ZU 90종(SHAPE `Z`), 립 C 없음. `Pipe150STD` 거부(Pipe 이름 형식 미확인) |
| 설계코드 | 구 `db/DSTL DGNCODE`: `AISC(16th)-LRFD22`·`AISC(16th)-ASD22`·`AISC(15th)-LRFD16/ASD16`·`AISC(14th)-LRFD10`·`AISI-CFSD08` 수용. **KR 은 신 API `DESIGN/STEEL/DSTL` 을 썼다** — AISC 가 신 API 에서 되는지, 설계 실행·결과 표(`post/STEELCODECHECK`) 는 **미확인** → US-1 라이브 첫 시험 |
| 판 차이 | 설계는 360-22, 단면 DB 는 AISC 14판(2010). W 치수는 대부분 같지만 이후 추가 단면은 없음 → 계산서에 명시 |

## US-0 — 원문 보완 (Codex 담당, US-1 과 병행)

| 일 | 이유 |
|---|---|
| 그림 28.3-1 (GCpf, 저층 포락선법) 지붕 경사별 값 표 전사 + 원문 대조 | US-1 풍하중의 핵심 계수. 지금은 쪽 이미지(PDF 356)만 있음 |
| 그림 27.3-1 (Cp, 방향성법) 전사 | 저층 범위 밖 대비·대조용 |
| 30장 외장재 GCp 그림 전사 | US-2 퍼린·거트 외장재 풍하중 |
| `aisc-360-22` 절 이름 수정: **F3·F8·E5** 내용이 앞 청크에 붙어 있음 (식 F3-1 → `AISC360-22-spec-F2.2~2`, F8-1 → `…-F7.4`, E5 제목 없음) | 절 번호 검색이 안 됨 — US-1 부재식 인용 전에 |
| 표 1.5-1(위험도 분류)·4.3-1 셀 대조 | 지금은 원문 배치 보존만 |

## 원문 조항 ↔ 구현 위치 (예정)

파일 구성은 KR 과 같게 한다: `codes/us.ts`(프로필) · `usSteel.ts` · `usLateral.ts` · `usConnection.ts`, `domain/usLoads.ts` · `usDesign.ts` · `usCatalog.ts` · `usConnections.ts` · `usSecondary.ts`.

| 항목 | 근거 (청크 id) | 구현 | 단계 |
|---|---|---|---|
| 재료 Fy·Fu·E (E = 200 000 MPa) | 360-22 A3.1 (`AISC360-22-spec-A3.1`), E3 기호 정의 (`…-E3`) | `codes/us.ts` | US-1 |
| 강도 하중조합 | 7-22 2.3.1 (`ASCE7-22-spec-2.3.1`), 2.3.6 지진 포함 조합 | `codes/us.ts`, `domain/usLoads.ts` | US-1 |
| 위험도 분류 → 계수 | 7-22 1.5 (`ASCE7-22-spec-1.5`), 표 1.5-2 (셀 대조됨) | `codes/usLateral.ts` | US-1 |
| 지붕 활하중 L_r 저감 | 7-22 4.8 (`ASCE7-22-spec-4.8`) | `codes/us.ts` | US-1 |
| 적설 (평지붕·경사·불균형·누적) | 7-22 7.2~7.7 (`…-7.2`~`…-7.7`), 표 7.3-1~7.3-4 (셀 대조됨) | `usLateral.ts`, `usLoads.ts` | US-1 (누적·편재 범위는 KR 수준) |
| 풍 — 공통 | 7-22 26.5~26.13: Kd 표 26.6-1, 노출 26.7, Kzt 26.8, Ke 표 26.9-1, Kz 표 26.10-1, q_z 식 26.10-1, 상수 표 26.11-1, GCpi 표 26.13-1 (모두 셀·식 대조됨) | `usLateral.ts` | US-1 |
| 풍 — 주골조 | 7-22 28장 저층 포락선법 (`ASCE7-22-spec-28.3*`) + **그림 28.3-1 (US-0 전사 후)** | `usLoads.ts` | US-1 (전사 도착 전까지 풍하중 모듈은 마지막 순서) |
| 지진 — 지반 계수 | 7-22 11.4.3: S_S·S_1·S_MS·S_M1 은 **USGS Seismic Design Geodatabase 에서** (Fa·Fv 표 없음) → 입력 | `usLateral.ts` | US-1 (사용자 입력 S_DS·S_D1) |
| 내진설계범주 | 표 11.6-1·11.6-2 (셀 대조됨) | `usLateral.ts` | US-1 |
| 시스템 R·Ω0·Cd | 표 12.2-1 (셀 대조됨, 예: 강 OMF 3½·3·3) | `usLateral.ts` | US-1 (범위는 결정 필요 ②) |
| 등가정적 Cs·Ta·분배 | 7-22 12.8 (`…-12.8*`), 표 12.8-1·12.8-2 | `usLateral.ts`, `usLoads.ts` | US-1 |
| 지진하중 효과 E (Eh·Ev·ρ) | 7-22 12.4, 12.3.4 | `usLoads.ts` | US-1 |
| 층간변위 한도 | 표 12.12-1 (셀 대조됨) | `domain/usDesign.ts` | US-1 |
| 판 분류 | 360-22 B4 + 표 B4.1a/b (`AISC360-22-spec-B4.1`) | `codes/usSteel.ts` | US-1 |
| 압축 | E3 휨좌굴 (`…-E3`, 식 E3-1~4), E4 비틀림좌굴, E7 세장판 | `usSteel.ts` | US-1 |
| 휨 | F2 (`…-F2*`), F3 (US-0 수정 후), F7 HSS (`…-F7*`), F8 원형 HSS (US-0 수정 후), F6 약축 | `usSteel.ts` | US-1 |
| 전단 | G2 (`…-G2*`), G4 HSS·G5 원형 | `usSteel.ts` | US-1 |
| 조합력 | H1.1 (`AISC360-22-spec-H1.1`, 식 H1-1a/b), H1.2 인장+휨 | `usSteel.ts` | US-1 |
| 안정 | 360-22 C 장 (`…-C1`·`…-C2`) — **부록 7 유효길이법 + 가상하중**(`…-App7.2.*`) + 부록 8 B1·B2 근사 2차 해석(`…-App8.*`) | `usSteel.ts`, `usDesign.ts` | US-1 |
| 접합 (볼트·용접·지압) | 360-22 J2·J3·J7·J8·J10 | `codes/usConnection.ts`, `domain/usConnections.ts` | US-2 |
| 앵커 콘크리트 정착 | ACI 318M 17장 (`ACI318M-19-code-17.6.2`, `…-17.10.1`) | `usConnection.ts` | US-2 |
| 독립기초 | ACI 318M 13.3 (`ACI318M-19-code-13.3.1`), 22.8 지압 | (TW `twFoundation` 방식) | US-2 |
| 외장재 풍하중 (퍼린·거트) | 7-22 30장 + **그림 (US-0 전사 후)** | `usSecondary.ts` | US-2 |
| 내진 상세 (OMF 등) | AISC 341 — 판 결정 필요 | — | US-2 이후 |

조항 번호·계수·표 값은 구현할 때 KB 청크와 원문 쪽 이미지를 다시 대조한다. ASCE KB 의 모든 청크는 `prelim`/`expert`·"계산 전 원문 배치 확인" 표시가 있고, 본문의 기호 정의 목록은 2단 편집으로 섞여 있다(식·표는 정상). 확인 못 한 값은 '미확인' + `expert`.

## 안정 해석 방식 — 유효길이법(부록 7) 제안

- Gen 은 선형 정적만 쓴다. 직접해석법(C 장)은 강성 감소(0.8τb EI)와 가상하중이 필요한데, 강성 감소를 Gen 모델에 넣으면 해석 모델이 앱 원 모델과 달라지고 동일성 검사(`genSync`)·순정 결과 회수 모드와 충돌한다.
- KR(KDS 14 31 15 4.3 유효길이법 + 가상하중 + B1·B2, `krSway.ts`)이 이미 같은 구조라 재사용할 수 있다. 적용 조건(Δ2차/Δ1차 ≤ 1.5)을 넘으면 KR 과 같이 구조화된 적용 한계 위반으로 처리한다.
- KDS 14 31 10 은 AISC 360 계열 번역이라 `krSteel.ts` 의 식 골격과 같은 부분이 많다. 다만 **US 는 360-22 원문 식·기호·φ 를 직접 인용해 별도 파일로 쓴다**(재료 E 210 000 vs 200 000, 판 분류 표·식 번호가 다름). 같은 입력으로 KR/US 결과를 나란히 놓는 오프라인 대조는 검증 보조로만 쓴다.

## 단면·재료 기본값

| 역할 | 제안 | 근거 |
|---|---|---|
| 기둥·지붕보 | W (A992) | Gen `AISC10(SI)` 수용 |
| 가새·스트럿 | HSS 각형/원형 (A500-50 = Gr.C) | Gen 수용 |
| 퍼린·거트 | **결정 필요 ①** — (a) 열간 C/MC·소형 W (360-22 로 검토 가능) 또는 (b) 냉간 Z (Gen `AISI08(US)` 있음, 앱 검토 불가 → `expert` + Gen 대조) | 미국 금속 건물 실무는 냉간 Z 가 일반적 |
| 단면 후보 목록 | `Dbase/AISC10(SI).sdb` 에서 추출(`krCatalog.ts` 방식), 성질은 Gen SECTIONALL 값 (`gen-section-property-source` 원칙) | |

## 적용범위 (`scope.ts`) 후보

| 조건 | 처리 | 이유 |
|---|---|---|
| 크레인·플랫폼·설비 등 추가 구조, RC 받침 | block (US-1) | 원문 대조·하중 경로 미구현 |
| 트러스 지붕·한 지붕 다경간(gableCols) | block (US-1) | KR 과 같은 범위(박공·편경사·다경간)부터 |
| 28장 저층 건물 정의 밖 (높이·평면 조건 — 26.2 정의 원문 확인) | block | 주골조 풍하중이 28장만 구현 |
| 내진설계범주가 선택 시스템의 허용 범위 밖 (표 12.2-1 NP) | block | |
| 냉간 성형 퍼린·거트 사용 | warn (최소 `expert`) | AISI S100 원문 없음 |
| 사용성 한계 (처짐·풍 횡변위) | warn (`expert`) | IBC 2021/2024 표 1604.3 원문 없음 — 결정 필요 ③ |
| 엔지니어 하중 읽어 오기(F2) | US-1 은 미지원(현재 TW 만) | 범위 확대는 별도 |

## Gen 연동

- 재료: `ASTM09(S)` 를 기본으로 (A1011 냉간 강종까지 한 표준에 있음). 재료 이름 ≤ 16자 검사를 `domain/gen` 에 넣는다.
- 단면: `AISC10(SI)`, `shapeOf`: `W`→`H`, `HSS…X…X…`(각형)→`B`, `HSS…X…`(원형)→`P`, `C`/`MC`→`C`, `L`→`L`. Pipe 형식은 미확인 → 후보에서 제외.
- 강재 설계 대조(`live-us.ts --gen-check`, KR `--gen-check` 방식): 신 API `DESIGN/STEEL/DSTL` 에서 `AISC(16th)-LRFD22` 수용 여부부터 시험 → 강재 설계용 조합 → 길이·K 맞춤 → 자동 저장 → 재해석 → 코드 검토 → 결과 표. 모델 생성 때는 설계코드를 보내지 않는다.
- 결과 회수: 앱 하중 모델이므로 순정 모드(케이스 표 + 앱 계수 합) 그대로.

## 단위

- 내부·Gen 전송은 지금처럼 SI(kN·m). US-1 화면·계산서도 SI 로 표시하고 원문 식 번호는 SI 식(예: 26.10-1.SI)을 인용한다.
- kip·ft·ksi 표시는 US-3 (입력 칸·계산서·도면 전체에 걸친 일이라 별도 단계).

## 단계 계획

### US-0 (Codex, 병행) — 위 「원문 보완」

### US-1 — 전체 흐름 (KR 1단계 수준)

1. 기준 등록: `CodeId` 에 `'US'`, `codes/us.ts` + `PROFILES`, 라벨 키 4개 언어(`code_US` 등), `CODE_IDS`, `defaultSpecFor('US')`, 드롭다운. 언어 규칙 변경 없음.
2. 재료·단면 카탈로그(`usCatalog.ts`), Gen 매핑.
3. 하중: D·L_r·S·E 와 조합 2.3.1 → 풍(그림 28.3-1 도착 후). 지역 값(풍속 V·지상 적설·S_DS·S_D1)은 입력 — 입력 칸 옆에 ASCE Hazard Tool·USGS 안내.
4. 부재 검토 360-22 + 유효길이법·B1·B2, 사용성(층간변위 12.12-1).
5. 화면·계산서·DXF·최적화(US 카탈로그) 연결 — 지금 KR 분기가 있는 파일 25개가 대상(`design`·`loads`·`gen`·`types`·`connections`·`secondary`·`optimize`·`sectionCatalog`·`results`·`report`·`drawings`·`scope`·`Panels`·`PlanCard`·`planFields`·`WindPreview`·`Status` 등).
6. 검증: 오프라인 `verify-us.ts`(합성 결과, KR `kr-synth` 방식 — 원문 식 손계산 값 대조), `verify-all` 등록. 라이브 `live-us.ts`(live-guarded, 박공·편경사·다경간, 평형 오차, API 오류 0, 12 DB 복원) → 정답 세트 `scripts/fixtures/us-sample.json.gz` + `verify-golden.ts --code US`. Gen AISC 설계 대조.
7. 문서: 이 파일에 구현 결과, implementation-log 에 라이브 수치, CLAUDE.md 「기준별 현재 상태」에 US 한 줄. 사용자에게 보이는 변경이므로 릴리즈(patch) + 4개 언어 노트.

### US-2 — 접합·기초·외장재·냉간
360-22 J 장 접합, ACI 17장 앵커·13장 기초, 30장 외장재 풍하중, 냉간 Z 퍼린(원문 없으면 Gen 대조 + `expert`), 내진 시스템 확대(OMF — 341 판 결정 후).

### US-3 — 사용 편의
USGS 웹서비스 연동(자동 S_DS·S_D1 — 외부 의존·CORS·오프라인 대안 검토), kip·ft·ksi 표시, ASD(2.4 조합 + 360-22 Ω), 엔지니어 하중 읽어 오기(F2) US 확대.

## i18n

- 새 문구는 모두 `t('key')`, `dict/en.ts` 기준으로 4개 언어. 기준 이름은 원어(`AISC 360-22 · ASCE 7-22`) 그대로 두고 설명만 번역.
- 국가별 문구는 `tc(code, key)` 방식으로 `_US` 키(필요한 곳만).
- 계산서 PDF 글꼴: 새 기호(ρ·Ω·τ 등)가 축소 글꼴에 있는지 `verify-pdf` 로 확인.

## 사용자 결정 필요

1. **퍼린·거트**: US-1 에서 열간 C/MC(앱 검토 가능)로 할지, 냉간 Z(실무형, 앱 검토 불가 → `expert`)로 할지.
2. **내진 시스템 범위**: US-1 은 표 12.2-1 중 AISC 341 상세가 필요 없는 강 시스템(원문 대조 후 행 확정)만 두고 그 시스템이 NP 인 범주는 block 할지, OMF(341 상세)까지 갈지.
3. **사용성 한계** (지붕보 처짐·풍 횡변위): IBC 최신판 원문이 없음 — 사용자 입력값(기본값 + `expert`)으로 할지, IBC 2015 표 1604.3 을 판 차이를 밝히고 쓸지.
4. **ASCE 7-22 원문 사용 범위**: 원본이 개인 구매본("personal use only") — 앱의 식·표 근거로 써도 되는지 회사 확인.
5. **지진 계수 입력**: US-1 은 S_DS·S_D1 직접 입력(USGS 값 복사)으로 시작하고 웹서비스 연동은 US-3 으로 미뤄도 되는지.
6. **ACI 판** (US-2): 318M-19 (ASCE 7-22 와 같은 시기) 기본 + 318M-25 선택 여부.
