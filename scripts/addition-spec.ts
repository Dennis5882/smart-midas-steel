import type {FactorySpec} from '../src/domain/types'
import {defaultAdditions,defaultOpening,defaultPlatform} from '../src/domain/additions'
import {defaultFloorOpening,defaultRoofOpening,defaultLink} from '../src/domain/phase6'
export function additionSpec(base:FactorySpec):FactorySpec {
  const s=structuredClone(base);s.bays=2;s.baySpacing=6;s.bayList=[5,7];s.features={crane:true,mezzanine:true,multiSpan:false,opening:false}
  s.additions=defaultAdditions(s)
  s.additions.equipment=[{id:'EQ1',name:'Roof machine',x:7.2,y:3.1,weight:40,seismicFraction:.8,source:'Test manufacturer',confirmed:true}]
  s.additions.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:5,seismicWeight:30,driftLimitMm:10,source:'Test manufacturer',confirmed:true}
  s.additions.platform={...defaultPlatform(s),x0:1,x1:11,elevation:3,source:'Test platform plan',confirmed:true}
  s.additions.factors={...s.additions.factors,source:'Test project load basis',confirmed:true}
  return s
}
export function phase5Spec(base:FactorySpec):FactorySpec {
  const s=additionSpec(base)
  s.bays=3;s.bayList=[5,7,4];s.baySpacing=7;s.features!.opening=true
  s.additions!.wallOpening={...defaultOpening(s),bay:s.code==='CN'?0:1,source:'Closed door project basis',confirmed:true}
  s.additions!.crane!.lateral=0;s.additions!.crane!.braking=0
  s.additions!.crane!.runway={section:s.sections.rafter,deflectionDivisor:600,source:'Runway project basis',confirmed:true}
  return s
}
export function phase6Spec(base:FactorySpec):FactorySpec {
  const s=additionSpec(base)
  s.bays=4;s.bayList=[5,7,6,4];s.baySpacing=7;s.features!.crane=false;s.additions!.crane=undefined
  s.additions!.roofOpening={...defaultRoofOpening(s),source:'Closed roof hatch plan and load basis',confirmed:true}
  s.additions!.floorOpening={...defaultFloorOpening(s),source:'Floor void plan',confirmed:true}
  s.additions!.link={...defaultLink(s),frame:2,elevation:4.5,aMovementMm:10,bMovementMm:15,thermalMovementMm:5,toleranceMm:5,availableGapMm:60,cases:[{name:'External simultaneous state 1',fx:20,fy:5,fz:-80,mx:3,my:8,mz:2},{name:'External simultaneous state 2',fx:-20,fy:-5,fz:-60,mx:-3,my:-8,mz:-2}],source:'External bridge analysis and movement envelope',confirmed:true}
  return s
}
