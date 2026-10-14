import type { Dict } from './en'

export const zhCN: Dict = {
  app_title: 'Smart MIDAS Steel',
  app_desc: (v) => `MIDAS Gen 钢结构自动建模工具 · v${v}`,
  lang_label: '语言',
  code_label: '设计规范',
  code_TW: '台湾 (LRFD)',
  generate: '生成示例厂房模型',
  summary: (nodes, elems) => `节点 ${nodes} 个 · 单元 ${elems} 个`,
  role_column: '柱',
  role_rafter: '屋面梁',
  role_purlin: '檩条',
  role_girt: '墙梁',
  role_strut: '系杆',
  combos_title: '荷载组合 (LRFD)',
  key_label: 'MAPI-Key（仅存于内存，不保存）',
  send: '发送到 MIDAS Gen',
  sending: (step) => `正在发送 ${step}…`,
  sent: '已发送到 MIDAS Gen',
  send_fail: (msg) => `失败：${msg}`,
}
