import type { Scenario } from "../game/scenario";
import type { StageInput } from "../lcd/director";
import type { VideoClip, VideoLayer } from "../lcd/videoLayer";
import { parseScenes, resolveScene, type SceneMediaMap } from "./manifest";
import { continuesAcrossSpins, sceneChain, type MediaScene } from "./scenes";

export interface MediaState {
  /** 今の場面（細かい順）。曲もこの順で探す */
  chain: MediaScene[];
  /** 映像の音を聞かせる場面（曲を止める） */
  videoSound: boolean;
}

/** local-assets/manifest.json の scenes を読む。無ければ空 */
export async function loadLocalScenes(root: string): Promise<SceneMediaMap> {
  try {
    const res = await fetch(`${root}local-assets/manifest.json`);
    if (!res.ok) return new Map();
    const raw = (await res.json()) as { scenes?: unknown };
    const { scenes, ignored } = parseScenes(raw.scenes);
    if (ignored.length > 0) console.warn(`[local-assets] scenes の次の項目は使えません: ${ignored.join(", ")}`);
    return scenes;
  } catch {
    return new Map();
  }
}

/** 台の状態から場面を決め、手元の映像を液晶に流す */
export class MediaDirector {
  private scenes: SceneMediaMap = new Map();
  private pushed: { scenario: Scenario; at: number } | null = null;
  /** 変動・大当たりが替わるたびに増える。場面ごとの映像を頭から流し直すのに使う */
  private episode = 0;
  private episodeOf: object | null = null;

  constructor(
    private readonly video: VideoLayer,
    private readonly root: string,
  ) {}

  setScenes(scenes: SceneMediaMap): void {
    this.scenes = scenes;
    // 流す瞬間に待たないよう、映像は先に読み始めておく
    for (const [scene, m] of scenes) if (m.video) this.video.preload(this.clip(scene, m.video));
  }

  update(s: StageInput): MediaState {
    const sp = s.spin;
    if (sp?.pushed && this.pushed?.scenario !== sp.scenario) this.pushed = { scenario: sp.scenario, at: sp.t };
    const owner = s.jackpot?.result ?? sp?.scenario ?? null;
    if (owner && owner !== this.episodeOf) {
      this.episodeOf = owner;
      this.episode++;
    }
    const pushedAt = sp && this.pushed?.scenario === sp.scenario ? this.pushed.at : undefined;
    const chain = sceneChain({ ...s, pushedAt });
    if (this.scenes.size === 0) return { chain, videoSound: false };
    const usable = chain.filter((c) => this.video.playable(c));
    const hit = resolveScene(usable, this.scenes, "video");
    const clip = hit?.media.video ? this.clip(hit.scene, hit.media.video) : null;
    // 段階が上がるときは速く、背景へ戻るときはゆっくり
    this.video.show(clip, sp || s.jackpot?.phase === "opening" ? 0.15 : 0.6);
    return { chain, videoSound: !!hit?.media.sound };
  }

  private clip(scene: MediaScene, file: string): VideoClip {
    const media = this.scenes.get(scene)!;
    const key = continuesAcrossSpins(scene) ? scene : `${scene}#${this.episode}`;
    return { key, source: scene, url: `${this.root}local-assets/${file}`, media };
  }
}
