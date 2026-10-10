/**
 * 信頼度から演出の出現率を作る。
 *
 * 実機の解析値は「その演出が出たときに当たる割合（信頼度）」で公開される。当たり時の出現率 h と
 * 信頼度 R を決めれば、ハズレ時の出現率は h・q(1-R) / (R(1-q)) で決まる（q はその演出が出うる
 * 変動のうち当たりの割合）。ハズレ側で残った分は既定の選択肢（何も出ない、白保留など）に回す。
 */

export interface Choice {
  /** 当たり時の出現率（重み。合計は 1 でなくてよい） */
  hit: number;
  /** 信頼度。省略した選択肢がハズレ側の残りを受け持つ（ちょうど 1 つ） */
  rel?: number;
}

export interface Tables<K extends string> {
  onHit: Record<K, number>;
  onMiss: Record<K, number>;
}

export function missRate(h: number, rel: number, q: number): number {
  if (rel >= 1) return 0;
  return (h * q * (1 - rel)) / (rel * (1 - q));
}

export function reliabilityTables<K extends string>(choices: Record<K, Choice>, q: number): Tables<K> {
  const keys = Object.keys(choices) as K[];
  const total = keys.reduce((s, k) => s + choices[k].hit, 0);
  const rest = keys.filter((k) => choices[k].rel === undefined);
  if (rest.length !== 1) throw new Error("信頼度を省略する選択肢はちょうど 1 つにする");
  const onHit = Object.fromEntries(keys.map((k) => [k, choices[k].hit / total])) as Record<K, number>;
  const miss = keys.map((k) => {
    const rel = choices[k].rel;
    return [k, rel === undefined ? 0 : missRate(onHit[k], rel, q)] as const;
  });
  const used = miss.reduce((s, [, m]) => s + m, 0);
  if (used > 1) throw new Error(`ハズレ側の出現率の合計が 1 を超える（${used.toFixed(3)}）`);
  const onMiss = Object.fromEntries(miss.map(([k, m]) => [k, k === rest[0] ? 1 - used : m])) as Record<K, number>;
  return { onHit, onMiss };
}
