import type { HoldColor } from "../game/lottery";
import type { InputKind } from "../game/machine";
import type { Chara, Cutin } from "../game/scenario";
import { MOOD_BGM } from "./mood";
import { BgmPlayer, BufferCache, loadCatalog, SCENE_BGM_PREFIX, sceneBgmId, type Catalog } from "./samples";

/**
 * 効果音・BGM・ボイスの出口。最初のユーザー操作で unlock() してから鳴る。
 * 音はすべて書き出し済みのファイル（public/audio/{bgm,se,voice}）を鳴らす。
 */

/** 台の状態ごとの曲。battle は SP の影法師バトル、spsp_* は SPSP の種類ごと、jackpot は大当たりラウンド中 */
export type Mood =
  | "off"
  | "normal"
  | "chance"
  | "reach"
  | "battle"
  | "spsp_storm"
  | "spsp_abyss"
  | "spsp_story"
  | "rush"
  | "lt"
  | "jackpot";

/** ループしない曲（大当たり・突入・終了のジングル） */
export type Jingle = "fanfare" | "rush_in" | "rush_end";

/** カットインの台詞は色の段階ごと、キャラごとに分ける */
export type CutinVoice = `cutin${Capitalize<Exclude<Cutin, "none">>}_${Chara}`;

/** id は scripts/voice/build.mjs の LINES と対応する */
export type VoiceId =
  | CutinVoice
  | `round_${Chara}`
  | "welcome"
  | "reach"
  | "next"
  | "gekiatsu"
  | "sp"
  | "spStorm"
  | "spAbyss"
  | "spStory"
  | "push"
  | "lever"
  | "hit"
  | "revival"
  | "miss"
  | "sudden"
  | "zenkaiten"
  | "lantern"
  | "challenge"
  | "rightShoot"
  | "rush"
  | "promote"
  | "challengeFail"
  | "lt"
  | "upper"
  | "rushHit"
  | "rushEnd"
  | "leftShoot"
  | "count3"
  | "count2"
  | "count1";

/** id は scripts/se/build.py の出力と対応する */
export type SeId =
  | "launch"
  | "heso_in"
  | "payout"
  | "attacker_in"
  | "hold_change"
  | "reel_stop"
  | "reel_stop_center"
  | "reach"
  | "cutin_blue"
  | "cutin_red"
  | "cutin_gold"
  | "button_appear"
  | "button_press"
  | "gekiatsu"
  | "kyuin"
  | "freeze"
  | "miss"
  | "gimmick"
  | "round_start"
  | "denchu_open"
  | "count_tick"
  | "flash"
  | "nail1"
  | "nail2"
  | "nail3"
  | "nail4"
  | "hold_white"
  | "hold_blue"
  | "hold_green"
  | "hold_red"
  | "hold_rainbow";

const NAILS: readonly SeId[] = ["nail1", "nail2", "nail3", "nail4"];

/** 保留の色 → SE。金とゼブラは専用の音が無いので近い音の高さを変えて鳴らす */
const HOLD_SE: Record<HoldColor, { id: SeId; rate: number }> = {
  white: { id: "hold_white", rate: 1 },
  blue: { id: "hold_blue", rate: 1 },
  green: { id: "hold_green", rate: 1 },
  red: { id: "hold_red", rate: 1 },
  gold: { id: "hold_rainbow", rate: 1.12 },
  zebra: { id: "hold_rainbow", rate: 0.9 },
  rainbow: { id: "hold_rainbow", rate: 1 },
};

/** BGM を下げる量。ジングルの間はほぼ消し、ボイスの間は少し下げる */
const DUCK_JINGLE = 0.12;
const DUCK_VOICE = 0.4;

/** manifest に無い id を鳴らそうとした（id の綴り違い・書き出し忘れ）。開発中だけ一度知らせる */
const warned = new Set<string>();
function missing(kind: string, id: string): void {
  if (!import.meta.env.DEV || warned.has(`${kind}/${id}`)) return;
  warned.add(`${kind}/${id}`);
  console.warn(`audio: ${kind} "${id}" is not in the manifest`);
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private seOut!: GainNode;
  private voiceOut!: GainNode;
  private jingleOut!: GainNode;
  private duckGain!: GainNode;
  private catalog: Catalog | null = null;
  private buffers!: BufferCache;
  private bgm: BgmPlayer | null = null;
  private currentVoice: AudioBufferSourceNode | null = null;
  private currentJingle: AudioBufferSourceNode | null = null;
  private voiceUntil = 0;
  private jingleUntil = 0;
  private lastNail = 0;
  private nailBudget = 0;
  private lastPayout = 0;
  private mood: Mood = "off";
  /** 今の場面（細かい順）。手元の場面ごとの曲があればそれを優先する */
  private scenes: readonly string[] = [];
  /** 映像の音を聞かせている間は曲とジングルを止める */
  private videoSound = false;
  /** 最後に指示した曲。1 回きりの場面曲を鳴り終わったあとに鳴らし直さないため、替わったときだけ指示する */
  private bgmTarget: string | null = null;
  private muted = false;
  private volume = 0.75;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** ブラウザの自動再生制限を外す。クリック・キー操作の中から呼ぶ */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.buffers = new BufferCache(ctx);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // 音源ごとにラウドネスは揃えてあるので、重なったときの頭打ちだけ抑える
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      this.master.connect(limiter).connect(ctx.destination);
      this.seOut = this.bus(0.8);
      this.voiceOut = this.bus(1);
      this.jingleOut = this.bus(0.7);
      this.duckGain = this.bus(1);
      const bgmOut = ctx.createGain();
      bgmOut.gain.value = 0.5;
      bgmOut.connect(this.duckGain);
      void this.load(ctx, bgmOut);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  private bus(gain: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  private async load(ctx: AudioContext, bgmOut: GainNode): Promise<void> {
    const cat = await loadCatalog(import.meta.env.BASE_URL);
    this.catalog = cat;
    this.bgm = new BgmPlayer(ctx, bgmOut, cat, this.buffers);
    // SE とボイスは鳴らす瞬間に待てないので先に全部読む。曲は今の曲を先に
    this.bgmTarget = this.bgmId();
    this.bgm.preload([this.bgmTarget ?? "normal"]);
    for (const e of [...cat.se.values(), ...cat.voice.values()]) void this.buffers.get(e.url);
    this.bgm.preload(["reach", "fanfare", "round", "battle", "spsp_storm", "spsp_abyss", "spsp_story"]);
    this.bgm.preload(["chance", "rush", "rush_in", "rush_end", "lt"]);
    this.bgm.preload([...cat.bgm.keys()].filter((id) => id.startsWith(SCENE_BGM_PREFIX)));
    void this.bgm.play(this.bgmTarget);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 曲を決める。scenes は今の場面（細かい順）、videoSound は映像の音を聞かせる場面か */
  setMood(mood: Mood, scenes: readonly string[] = [], videoSound = false): void {
    this.mood = mood;
    this.scenes = scenes;
    this.videoSound = videoSound;
    if (!this.bgm) return;
    const id = this.bgmId();
    if (id === this.bgmTarget) return;
    this.bgmTarget = id;
    void this.bgm.play(id, 0.5);
  }

  private bgmId(): string | null {
    if (this.videoSound) return null;
    const bgm = this.catalog?.bgm;
    const own = bgm && this.scenes.map(sceneBgmId).find((id) => bgm.has(id));
    return own ?? MOOD_BGM[this.mood];
  }

  /** 読み込み済みの音をすぐ鳴らす。まだなら鳴らさない（後から遅れて鳴るほうが変） */
  private play(kind: "se" | "voice", id: string, out: AudioNode, gain = 1, rate = 1): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    const entry = this.catalog?.[kind].get(id);
    if (!entry && this.catalog) missing(kind, id);
    if (!ctx || ctx.state !== "running" || !entry) return null;
    const buf = this.buffers.peek(entry.url);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (gain === 1) src.connect(out);
    else {
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(out);
    }
    src.start();
    return src;
  }

  se(id: SeId, gain = 1, rate = 1): void {
    this.play("se", id, this.seOut, gain, rate);
  }

  /** ボイスを鳴らす。前の台詞は切る。鳴っている間は BGM を下げる */
  voice(id: VoiceId): void {
    const src = this.play("voice", id, this.voiceOut);
    if (!src || !this.ctx) return;
    this.currentVoice?.stop();
    this.currentVoice = src;
    src.onended = () => {
      if (this.currentVoice === src) this.currentVoice = null;
    };
    this.voiceUntil = this.ctx.currentTime + (src.buffer?.duration ?? 0);
    this.duck();
  }

  /** ジングルを鳴らす。鳴っている間はループの曲をほぼ消す */
  jingle(id: Jingle): void {
    if (this.videoSound) return;
    const ctx = this.ctx;
    const entry = this.catalog?.bgm.get(id);
    if (!entry && this.catalog) missing("bgm", id);
    if (!ctx || ctx.state !== "running" || !entry) return;
    const buf = this.buffers.peek(entry.url);
    if (!buf) return;
    this.currentJingle?.stop();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.jingleOut);
    src.start();
    this.currentJingle = src;
    src.onended = () => {
      if (this.currentJingle === src) this.currentJingle = null;
    };
    this.jingleUntil = ctx.currentTime + buf.duration;
    this.duck();
  }

  /** ジングルとボイスの終わる時刻から、BGM の音量の推移を引き直す */
  private duck(): void {
    const ctx = this.ctx!;
    const g = this.duckGain.gain;
    const now = ctx.currentTime;
    const level = (t: number) => (t < this.jingleUntil ? DUCK_JINGLE : t < this.voiceUntil ? DUCK_VOICE : 1);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(level(now), now, 0.04);
    const ends = [this.voiceUntil, this.jingleUntil].filter((t) => t > now).sort((a, b) => a - b);
    for (const t of ends) g.setTargetAtTime(level(t + 0.001), t, 0.3);
  }

  /** 釘に当たった音。数が多いので 1 秒あたりの回数を絞る */
  nail(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || speed < 140) return;
    const now = ctx.currentTime;
    this.nailBudget = Math.min(30, this.nailBudget + (now - this.lastNail) * 30);
    this.lastNail = now;
    if (this.nailBudget < 1) return;
    this.nailBudget--;
    const id = NAILS[Math.floor(Math.random() * NAILS.length)];
    this.play("se", id, this.seOut, Math.min(1, 0.35 + speed / 900), 0.94 + Math.random() * 0.12);
  }

  hold(color: HoldColor): void {
    const s = HOLD_SE[color];
    this.play("se", s.id, this.seOut, 1, s.rate);
  }

  /** 入賞の払い出し。間隔が詰まったら鳴らさない */
  payout(source: InputKind): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (source === "attacker") {
      this.se("attacker_in");
      return;
    }
    const now = ctx.currentTime;
    if (now - this.lastPayout < 0.08) return;
    this.lastPayout = now;
    this.se(source === "heso" || source === "denchu" ? "heso_in" : "payout", 0.8);
  }
}
