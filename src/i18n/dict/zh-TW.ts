import type { Dict } from './en'

export const zhTW: Dict = {
  app_title: 'Smart MIDAS Steel',
  app_desc: (v) => `MIDAS Gen 鋼結構自動建模工具 · v${v}`,
  lang_label: '語言',
  code_label: '設計規範',
  code_TW: '臺灣 (LRFD)',
  generate: '產生範例廠房模型',
  summary: (nodes, elems) => `節點 ${nodes} 個 · 單元 ${elems} 個`,
  role_column: '柱',
  role_rafter: '屋樑',
  role_purlin: '檁條',
  role_girt: '牆樑',
  role_strut: '繫材',
  combos_title: '載重組合 (LRFD)',
  key_label: 'MAPI-Key（僅存於記憶體，不儲存）',
  send: '傳送至 MIDAS Gen',
  sending: (step) => `正在傳送 ${step}…`,
  sent: '已傳送至 MIDAS Gen',
  send_fail: (msg) => `失敗：${msg}`,
}
