/** Project quantities use kN, m and kN/m². No rated crane capacity is converted to wheel loads. */
export interface EquipmentLoad {
  id: string; name: string; x: number; y: number; weight: number; seismicFraction: number
  source: string; confirmed: boolean
}
export interface CraneOptions {
  id: string; elevation: number; eccentricity: number; wheelSpacing: number
  maxWheel: number; minWheel: number; impactFactor: number; lateral: number; braking: number
  seismicWeight: number; source: string; confirmed: boolean
  driftLimitMm: number
}
export interface PlatformOptions {
  id: string; kind: 'mezzanine' | 'equipment'; elevation: number
  x0: number; x1: number; firstBay: number; lastBay: number; beamSpacing: number
  beamSection: string; columnSection: string; dead: number; live: number; liveMassFraction: number
  source: string; confirmed: boolean
  deflectionDivisor: number
}
export interface AdditionFactors {
  dead: number; live: number; accompanyingLive: number; crane: number
  source: string; confirmed: boolean
}
export interface FactoryAdditions {
  equipment: EquipmentLoad[]; crane?: CraneOptions; platform?: PlatformOptions
  factors: AdditionFactors
}
export type AdditionUsage = 'platform-beam' | 'platform-column'
export interface PhysicalMember {
  key: string; elementIds: number[]; length: number; source: 'factory' | string
}
export interface AdditionNodalLoad {
  node: number; case: string; source: string
  fx: number; fy: number; fz: number; mx: number; my: number; mz: number
}
export interface AdditionBeamLoad { element: number; case: string; source: string; q: number }
export interface AdditionModel {
  members: PhysicalMember[]
  nodal: AdditionNodalLoad[]; beam: AdditionBeamLoad[]
  /** Seismic weight (kN), not a mass in tonnes. Structural self-weight is recorded once. */
  seismicWeights: { node: number; weight: number; source: string }[]
  fixedBases: number[]
  craneCases: { name: string; position: number; maxRail: 'left' | 'right'; lateralSign: number; brakingSign: number }[]
  sources: { id: string; kind: 'equipment' | 'crane' | 'platform'; dead: number; live: number; seismic: number }[]
}
