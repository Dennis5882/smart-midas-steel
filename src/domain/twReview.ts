/* 대만 簽證·建照 구조 심사 항목 ↔ 계산서 장 대응표 (순수). 심사자가 항목을 찾기 쉽게, 빠지거나 일부만 된 항목은 사유를 남긴다.
   항목 = 建築技術規則 構造編·鋼構造 規範의 통상 심사 항목(설계 규범·재료, 구조계, 靜/活載重, 風力, 地震力, 載重組合, 構材, 變位, 接合, 基礎, 冷軋型鋼, 耐震細部, 銲接).
   사유 기본값은 앱 상태로 정하고, 사용자가 산출물 화면에서 바꿀 수 있다 (S.reviewReasons). */
import type { ScopeIssue } from './scope'
import type { FactorySpec } from './types'

export type ReviewKey = 'code' | 'system' | 'dead' | 'live' | 'wind' | 'seismic' | 'combo' | 'member' | 'drift' | 'connection' | 'foundation' | 'coldFormed' | 'seismicDetail' | 'welding'
export type ReviewStatus = 'included' | 'partial' | 'omitted'
export type ReviewReason = 'siteAssumed' | 'needDesign' | 'needConnections' | 'interiorJoints' | 'trussJoints' | 'foundationPrelim' | 'foundationSeparate' | 'coldFormedPrelim' | 'seismicDetail' | 'weldFabricator' | 'additionsLoads'
export interface ReviewItem { key: ReviewKey; section: 'rep_s1' | 'rep_s2' | 'rep_s3' | 'rep_s4' | 'rep_s6' | 'rep_s7' | 'rep_s8'; status: ReviewStatus; reason?: ReviewReason }
export const REVIEW_KEYS: ReviewKey[] = ['code', 'system', 'dead', 'live', 'wind', 'seismic', 'combo', 'member', 'drift', 'connection', 'foundation', 'coldFormed', 'seismicDetail', 'welding']

export interface ReviewInput { spec: FactorySpec; issues: ScopeIssue[]; design: boolean; connections: boolean; footing: boolean; coldFormed: boolean }

export function reviewItems({ spec, issues, design, connections, footing, coldFormed }: ReviewInput): ReviewItem[] {
  if (spec.code !== 'TW') return []
  const has = (k: string) => issues.some((i) => i.key === k)
  const interior = (spec.frame === 'multi' || spec.frame === 'gableCols')
  const items: ReviewItem[] = [
    { key: 'code', section: 'rep_s1', status: 'included' },
    { key: 'system', section: 'rep_s2', status: 'included' },
    { key: 'dead', section: 'rep_s3', status: 'included' },
    { key: 'live', section: 'rep_s3', status: spec.features?.mezzanine || spec.features?.crane ? 'partial' : 'included', ...(spec.features?.mezzanine || spec.features?.crane ? { reason: 'additionsLoads' as const } : {}) },
    { key: 'wind', section: 'rep_s3', status: 'included' },
    { key: 'seismic', section: 'rep_s3', status: has('siteAssumed') ? 'partial' : 'included', ...(has('siteAssumed') ? { reason: 'siteAssumed' as const } : {}) },
    { key: 'combo', section: 'rep_s4', status: 'included' },
    { key: 'member', section: 'rep_s6', status: design ? 'included' : 'omitted', ...(design ? {} : { reason: 'needDesign' as const }) },
    { key: 'drift', section: 'rep_s7', status: design ? 'included' : 'omitted', ...(design ? {} : { reason: 'needDesign' as const }) },
    { key: 'connection', section: 'rep_s8', ...(!connections ? { status: 'omitted' as const, reason: 'needConnections' as const }
      : spec.frame === 'truss' ? { status: 'partial' as const, reason: 'trussJoints' as const }
      : interior ? { status: 'partial' as const, reason: 'interiorJoints' as const } : { status: 'included' as const }) },
    { key: 'foundation', section: 'rep_s8', ...(footing ? { status: 'partial' as const, reason: 'foundationPrelim' as const } : { status: 'omitted' as const, reason: 'foundationSeparate' as const }) },
    ...(coldFormed ? [{ key: 'coldFormed' as const, section: 'rep_s6' as const, status: 'partial' as const, reason: 'coldFormedPrelim' as const }] : []),
    { key: 'seismicDetail', section: 'rep_s8', status: 'partial', reason: 'seismicDetail' },
    { key: 'welding', section: 'rep_s8', status: connections ? 'partial' : 'omitted', reason: connections ? 'weldFabricator' : 'needConnections' },
  ]
  return items
}
