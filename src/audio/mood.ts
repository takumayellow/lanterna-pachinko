import type { Scenario } from "../game/scenario";
import type { Mood } from "./audio";

/**
 * 台の状態ごとに鳴らす曲（public/audio/bgm/manifest.json の id）。チャンス中（時短）と LT は専用曲，
 * 大当たりラウンド中は round。場面ごとの曲（scene_*）があればそちらが優先する。
 */
export const MOOD_BGM: Readonly<Record<Mood, string | null>> = {
  off: null,
  normal: "normal",
  chance: "chance",
  reach: "reach",
  battle: "battle",
  spsp_storm: "spsp_storm",
  spsp_abyss: "spsp_abyss",
  spsp_story: "spsp_story",
  jackpot: "round",
  rush: "rush",
  lt: "lt",
};

/**
 * 変動中のリーチ演出が決める曲。SPSP は種類ごとの曲，SP は影法師バトル（SPSP へ発展する SP を含む）だけ
 * バトル曲，ほかの SP はリーチ曲。リーチ演出に入っていなければ null（台の状態で決める）。
 */
export function spinMood(sc: Scenario, t: number): Mood | null {
  if (sc.spspAt !== undefined && t >= sc.spspAt) return sc.spsp ? `spsp_${sc.spsp}` : "battle";
  if (sc.spAt !== undefined && t >= sc.spAt) return sc.sp === "shade" || sc.spspAt !== undefined ? "battle" : "reach";
  return null;
}
