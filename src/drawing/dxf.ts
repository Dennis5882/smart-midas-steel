/* 최소 DXF (AutoCAD R12, ASCII) 작성기 — LINE·CIRCLE·TEXT·레이어. 단위 mm ($INSUNITS 4).
   R12 는 비ASCII 문자 인코딩이 환경마다 달라 도면 문자는 영문·숫자만 쓴다. */

export interface Layer { name: string; color: number }

export class Dxf {
  private ents: string[] = []
  constructor(private layers: Layer[]) {}

  line(layer: string, x1: number, y1: number, x2: number, y2: number): void {
    this.ents.push(`0\nLINE\n8\n${layer}\n10\n${r(x1)}\n20\n${r(y1)}\n30\n0\n11\n${r(x2)}\n21\n${r(y2)}\n31\n0`)
  }
  circle(layer: string, x: number, y: number, rad: number): void {
    this.ents.push(`0\nCIRCLE\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(rad)}`)
  }
  /** align: 0 = 왼쪽, 1 = 가운데, 2 = 오른쪽 (기준점 = 글자 아래선) */
  text(layer: string, x: number, y: number, h: number, s: string, align: 0 | 1 | 2 = 0, rot = 0): void {
    const ascii = s.replace(/[^\x20-\x7e]/g, '?')
    const al = align ? `\n72\n${align}\n11\n${r(x)}\n21\n${r(y)}\n31\n0` : ''
    this.ents.push(`0\nTEXT\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${ascii}${rot ? `\n50\n${rot}` : ''}${al}`)
  }
  rect(layer: string, x: number, y: number, w: number, h: number): void {
    this.line(layer, x, y, x + w, y); this.line(layer, x + w, y, x + w, y + h)
    this.line(layer, x + w, y + h, x, y + h); this.line(layer, x, y + h, x, y)
  }
  /** 수평·수직 치수 — 치수선 + 끝 표시 + 값 */
  dim(layer: string, x1: number, y1: number, x2: number, y2: number, off: number, h: number, label?: string): void {
    const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1)
    if (horiz) {
      const y = Math.min(y1, y2) - off
      this.line(layer, x1, y, x2, y); this.line(layer, x1, y - h / 2, x1, y + h / 2); this.line(layer, x2, y - h / 2, x2, y + h / 2)
      this.text(layer, (x1 + x2) / 2, y + h * 0.4, h, label ?? String(Math.round(Math.abs(x2 - x1))), 1)
    } else {
      const x = Math.min(x1, x2) - off
      this.line(layer, x, y1, x, y2); this.line(layer, x - h / 2, y1, x + h / 2, y1); this.line(layer, x - h / 2, y2, x + h / 2, y2)
      this.text(layer, x - h * 0.4, (y1 + y2) / 2, h, label ?? String(Math.round(Math.abs(y2 - y1))), 1, 90)
    }
  }

  toString(): string {
    const layerTbl = this.layers.map((l) => `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS`).join('\n')
    return [
      '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC',
      `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${this.layers.length}\n${layerTbl}\n0\nENDTAB\n0\nENDSEC`,
      `0\nSECTION\n2\nENTITIES\n${this.ents.join('\n')}\n0\nENDSEC`,
      '0\nEOF\n',
    ].join('\n')
  }
}

const r = (v: number) => (Math.round(v * 100) / 100).toString()
