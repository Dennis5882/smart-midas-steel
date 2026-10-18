export const sectionEn = {
  section_empty: 'No section entered', section_current: 'Current value',
  section_review_short: 'Property review', section_preliminary_short: 'Preliminary',
  section_options_note: (material: string, n: number) => `${material} · ${n} catalog choices for this member role`,
  section_outside: 'The current value is outside the selectable catalog for this material and role. It is retained; confirm Gen availability and calculation applicability before use.',
  section_no_options: 'No catalog choices for this material and role. The current value is retained; review the material or check Gen availability and calculation applicability before direct entry.',
  section_property_review: (p: string) => `App section properties differ from the audited Gen values by up to ${p}%. Review the assumptions; registration does not establish design adequacy.`,
  section_preliminary_note: 'Cold-formed section: preliminary checks only. Confirm the calculation limits and details separately.',
  section_manual: 'Enter section name directly', section_manual_label: 'Section name',
  section_manual_note: 'Direct entry does not confirm Gen registration or calculation applicability. Use the exact Gen section name.',
}
export const sectionKo = {
  section_empty: '입력된 단면 없음', section_current: '현재값',
  section_review_short: '성질 검토', section_preliminary_short: '예비검토',
  section_options_note: (material: string, n: number) => `${material} · 해당 부재용 카탈로그 ${n}개`,
  section_outside: '현재값은 해당 재료·부재의 선택 카탈로그에 없습니다. 값은 유지하며, 사용 전 Gen 등록 여부와 계산 적용범위를 확인하세요.',
  section_no_options: '해당 재료·부재에 선택 가능한 카탈로그가 없습니다. 현재값은 유지합니다. 재료를 검토하거나 Gen 등록 여부와 계산 적용범위를 확인한 뒤 직접 입력하세요.',
  section_property_review: (p: string) => `앱 단면 성질과 조사한 Gen 값의 차이가 최대 ${p}%입니다. 성질 가정을 검토하세요. 등록 확인이 설계 적합성을 뜻하지는 않습니다.`,
  section_preliminary_note: '냉간성형 단면은 예비검토입니다. 계산 적용범위와 접합 상세를 별도로 확인하세요.',
  section_manual: '단면명 직접 입력', section_manual_label: '단면명',
  section_manual_note: '직접 입력은 Gen 등록·계산 적용범위를 확인하지 않습니다. Gen의 정확한 단면명을 입력하세요.',
}
export const sectionTw = {
  section_empty: '尚未輸入斷面', section_current: '目前值',
  section_review_short: '性質待核對', section_preliminary_short: '初步檢核',
  section_options_note: (material: string, n: number) => `${material} · 此構件可選型錄 ${n} 筆`,
  section_outside: '目前值不在此材料與構件的可選型錄中。保留原值；使用前請確認 Gen 收錄情形與計算適用範圍。',
  section_no_options: '此材料與構件無可選型錄。保留目前值；請檢視材料，或確認 Gen 收錄情形與計算適用範圍後直接輸入。',
  section_property_review: (p: string) => `程式斷面性質與已核對的 Gen 值最大差異為 ${p}%。請核對性質假設；登錄確認不代表設計合格。`,
  section_preliminary_note: '冷軋型鋼僅提供初步檢核。請另行確認計算適用範圍與接合細節。',
  section_manual: '直接輸入斷面名稱', section_manual_label: '斷面名稱',
  section_manual_note: '直接輸入不代表已確認 Gen 登錄或計算適用範圍。請使用 Gen 的完整斷面名稱。',
}
export const sectionCn = {
  section_empty: '尚未输入截面', section_current: '当前值',
  section_review_short: '特性待核对', section_preliminary_short: '初步验算',
  section_options_note: (material: string, n: number) => `${material} · 此构件可选型录 ${n} 项`,
  section_outside: '当前值不在此材料与构件的可选型录中。保留原值；使用前请确认 Gen 收录情况与计算适用范围。',
  section_no_options: '此材料与构件无可选型录。保留当前值；请检查材料，或确认 Gen 收录情况与计算适用范围后直接输入。',
  section_property_review: (p: string) => `程序截面特性与已核对的 Gen 值最大差异为 ${p}%。请核对特性假定；注册确认不代表设计合格。`,
  section_preliminary_note: '冷弯型钢仅提供初步验算。请另行确认计算适用范围与连接细节。',
  section_manual: '直接输入截面名称', section_manual_label: '截面名称',
  section_manual_note: '直接输入不代表已确认 Gen 注册或计算适用范围。请使用 Gen 的完整截面名称。',
}
