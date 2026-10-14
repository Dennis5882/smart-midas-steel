/* 영어 사전 — 키의 기준(폴백). 다른 언어는 `Dict` 타입으로 키 일치를 컴파일 시점에 검사. */
export const en = {
  app_title: 'Smart MIDAS Steel',
  app_desc: (v: string) => `Steel structure auto-modeling tool for MIDAS Gen · v${v}`,
  lang_label: 'Language',
  code_label: 'Design code',
  code_TW: 'Taiwan (LRFD)',
  generate: 'Generate sample factory model',
  summary: (nodes: number, elems: number) => `${nodes} nodes · ${elems} elements`,
  role_column: 'Column',
  role_rafter: 'Rafter',
  role_purlin: 'Purlin',
  role_girt: 'Girt',
  role_strut: 'Strut',
  combos_title: 'Load combinations (LRFD)',
  key_label: 'MAPI-Key (memory only, never saved)',
  send: 'Send to MIDAS Gen',
  sending: (step: string) => `Sending ${step}…`,
  sent: 'Sent to MIDAS Gen',
  send_fail: (msg: string) => `Failed: ${msg}`,
}

export type Dict = typeof en
