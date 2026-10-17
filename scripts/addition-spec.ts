import type {FactorySpec} from '../src/domain/types'
import {defaultAdditions,defaultPlatform} from '../src/domain/additions'
export function additionSpec(base:FactorySpec):FactorySpec {
  const s=structuredClone(base);s.bays=2;s.baySpacing=6;s.bayList=[5,7];s.features={crane:true,mezzanine:true,multiSpan:false,opening:false}
  s.additions=defaultAdditions(s)
  s.additions.equipment=[{id:'EQ1',name:'Roof machine',x:7.2,y:3.1,weight:40,seismicFraction:.8,source:'Test manufacturer',confirmed:true}]
  s.additions.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:5,seismicWeight:30,driftLimitMm:10,source:'Test manufacturer',confirmed:true}
  s.additions.platform={...defaultPlatform(s),x0:1,x1:11,elevation:3,source:'Test platform plan',confirmed:true}
  s.additions.factors={...s.additions.factors,source:'Test project load basis',confirmed:true}
  return s
}
