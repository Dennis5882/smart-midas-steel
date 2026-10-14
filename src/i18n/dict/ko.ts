import type { Dict } from './en'

export const ko: Dict = {
  app_title: 'Smart MIDAS Steel',
  app_desc: (v) => `MIDAS Gen 강구조물 자동 모델링 도구 · v${v}`,
  lang_label: '언어',
  code_label: '설계기준',
  code_TW: '대만 (LRFD)',
  generate: '샘플 공장 모델 생성',
  summary: (nodes, elems) => `절점 ${nodes}개 · 요소 ${elems}개`,
  role_column: '기둥',
  role_rafter: '지붕보',
  role_purlin: '퍼린',
  role_girt: '거트',
  role_strut: '스트럿',
  combos_title: '하중조합 (LRFD)',
  key_label: 'MAPI-Key (메모리에만 보관, 저장 안 함)',
  send: 'MIDAS Gen으로 전송',
  sending: (step) => `${step} 전송 중…`,
  sent: 'MIDAS Gen으로 전송 완료',
  send_fail: (msg) => `실패: ${msg}`,
}
