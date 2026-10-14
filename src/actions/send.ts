/* 모델 → MIDAS Gen 전송.
   순서: 단위 → 재료 → 단면 → 절점 → 요소 → 지지조건 → 하중케이스 → 자중 → 보하중 → 하중조합 → 설계 코드. */
import { profileOf } from '@/codes'
import { buildGenPayloads } from '@/domain/gen'
import { buildLoadPayloads } from '@/domain/loads'
import type { FactoryModel, FactorySpec } from '@/domain/types'
import { mapi } from '@/mapi/client'

export async function sendModel(spec: FactorySpec, model: FactoryModel, onStep?: (name: string) => void): Promise<void> {
  const p = buildGenPayloads(spec, model)
  const l = buildLoadPayloads(spec, model)
  const steps: [string, Record<string, unknown>][] = [
    ['UNIT', p.UNIT], ['MATL', p.MATL], ['SECT', p.SECT], ['NODE', p.NODE], ['ELEM', p.ELEM], ['CONS', p.CONS],
    ['STLD', l.STLD], ['BODF', l.BODF], ['BMLD', l.BMLD], ['LCOM-GEN', l['LCOM-GEN']],
  ]
  for (const [name, assign] of steps) {
    onStep?.(name)
    await mapi('PUT', name, { Assign: assign })
  }
  onStep?.('DSTL')
  await mapi('PUT', 'DSTL', { Assign: { 1: { DGNCODE: profileOf(spec.code).gen.designCode } } })
}
