import { parseScenes, relPath } from "../media/manifest";

/**
 * 書き出し済みの音（BGM・SE・ボイス）を読み込んで鳴らす。
 *
 * 各フォルダの manifest.json に並んだファイルを読む。`local-assets/manifest.json` があれば、
 * そこに書いた id のファイルを同梱の音より優先する（手元で正規に持っている素材の差し込み口）。
 * scenes に書いた場面ごとの曲は `scene:<場面>` の id で入る。
 */

/** 場面ごとの曲の id の頭 */
export const SCENE_BGM_PREFIX = "scene:";

/** 場面ごとの曲の id */
export function sceneBgmId(scene: string): string {
  return `${SCENE_BGM_PREFIX}${scene}`;
}

export interface BgmEntry {
  id: string;
  file: string;
  /** ループの始まりと終わり [s]。無ければ全体をループする */
  loopStart?: number;
  loopEnd?: number;
  /** ループさせない（ジングル） */
  oneShot?: boolean;
}

/** BGM の manifest に書かれている形（scripts/music の出力）。loop: false がジングル */
interface RawBgmEntry {
  id: string;
  file: string;
  loop?: boolean;
  loopStart?: number | null;
  loopEnd?: number | null;
  oneShot?: boolean;
}

function toBgmEntry(e: RawBgmEntry): BgmEntry {
  return {
    id: e.id,
    file: e.file,
    loopStart: e.loopStart ?? undefined,
    loopEnd: e.loopEnd ?? undefined,
    oneShot: e.oneShot ?? e.loop === false,
  };
}

export interface SampleEntry {
  id: string;
  file: string;
}

interface Manifest<T> {
  base: string;
  entries: T[];
}

/** local-assets/manifest.json の形。種類ごとに id → ファイル名（local-assets/ からの相対） */
interface LocalManifest {
  bgm?: Record<string, string | { file: string; loopStart?: number; loopEnd?: number }>;
  se?: Record<string, string>;
  voice?: Record<string, string>;
  scenes?: unknown;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function readManifest<T>(base: string): Promise<Manifest<T>> {
  const raw = await fetchJson<T[] | { entries?: T[]; tracks?: T[] }>(`${base}manifest.json`);
  const entries = Array.isArray(raw) ? raw : (raw?.entries ?? raw?.tracks ?? []);
  return { base, entries };
}

/** 種類ごとの id → 再生に使う URL と設定 */
export interface Catalog {
  bgm: Map<string, BgmEntry & { url: string }>;
  se: Map<string, { url: string }>;
  voice: Map<string, { url: string }>;
}

export async function loadCatalog(root: string): Promise<Catalog> {
  const [bgm, se, voice, local] = await Promise.all([
    readManifest<RawBgmEntry>(`${root}audio/bgm/`),
    readManifest<SampleEntry>(`${root}audio/se/`),
    readManifest<SampleEntry>(`${root}audio/voice/`),
    fetchJson<LocalManifest>(`${root}local-assets/manifest.json`),
  ]);
  const cat: Catalog = {
    bgm: new Map(bgm.entries.map((e) => [e.id, { ...toBgmEntry(e), url: bgm.base + e.file }])),
    se: new Map(se.entries.map((e) => [e.id, { url: se.base + e.file }])),
    voice: new Map(voice.entries.map((e) => [e.id, { url: voice.base + e.file }])),
  };
  if (!local) return cat;
  const lbase = `${root}local-assets/`;
  for (const [id, v] of Object.entries(local.bgm ?? {})) {
    const e = typeof v === "string" ? { file: v } : v;
    const file = relPath(e?.file);
    if (!file) continue;
    const prev = cat.bgm.get(id);
    cat.bgm.set(id, { id, oneShot: prev?.oneShot, ...e, file, url: lbase + file });
  }
  for (const [id, f] of Object.entries(local.se ?? {})) {
    const file = relPath(f);
    if (file) cat.se.set(id, { url: lbase + file });
  }
  for (const [id, f] of Object.entries(local.voice ?? {})) {
    const file = relPath(f);
    if (file) cat.voice.set(id, { url: lbase + file });
  }
  for (const [scene, m] of parseScenes(local.scenes).scenes) {
    if (!m.bgm) continue;
    const id = sceneBgmId(scene);
    cat.bgm.set(id, { id, file: m.bgm, oneShot: !m.loop, url: lbase + m.bgm });
  }
  return cat;
}

/** URL ごとに一度だけ取得・デコードする */
export class BufferCache {
  private readonly cache = new Map<string, Promise<AudioBuffer | null>>();
  private readonly ready = new Map<string, AudioBuffer>();
  constructor(private readonly ctx: BaseAudioContext) {}

  get(url: string): Promise<AudioBuffer | null> {
    let p = this.cache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${url}`))))
        .then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => (this.ready.set(url, buf), buf))
        .catch(() => null);
      this.cache.set(url, p);
    }
    return p;
  }

  /** 読み込み済みならすぐ返す（鳴らす瞬間に待たないため）。まだなら読み込みを始めて null */
  peek(url: string): AudioBuffer | null {
    const buf = this.ready.get(url);
    if (!buf) void this.get(url);
    return buf ?? null;
  }
}

interface Playing {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/** BGM を 1 本ずつクロスフェードで切り替える */
export class BgmPlayer {
  private current: Playing | null = null;
  /** 切り替えの順番。読み込みを待つ間に次の指示が来たら古い指示を捨てる */
  private ticket = 0;
  /** 最後に指示された曲（読み込み待ちの間は current と食い違う） */
  private target: string | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly catalog: Catalog,
    private readonly buffers: BufferCache,
  ) {}

  get playing(): string | null {
    return this.current?.id ?? null;
  }

  /** id の曲に切り替える。null で止める。同じ曲なら何もしない */
  async play(id: string | null, fade = 0.6): Promise<void> {
    if (this.target === id) return;
    this.target = id;
    const t = ++this.ticket;
    const entry = id ? this.catalog.bgm.get(id) : undefined;
    const buf = entry ? await this.buffers.get(entry.url) : null;
    if (t !== this.ticket) return;
    const now = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      old.src.stop(now + fade + 0.05);
      this.current = null;
    }
    if (!entry || !buf || !id) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (!entry.oneShot) {
      src.loop = true;
      src.loopStart = entry.loopStart ?? 0;
      src.loopEnd = entry.loopEnd ?? buf.duration;
    }
    const gain = this.ctx.createGain();
    // ジングルは頭から全開で鳴らす。ループ曲はフェードインで入る
    gain.gain.setValueAtTime(entry.oneShot ? 1 : 0, now);
    if (!entry.oneShot) gain.gain.linearRampToValueAtTime(1, now + Math.min(fade, 0.4));
    src.connect(gain).connect(this.out);
    // ループ曲のファイルは頭に前置きがあるので、ループの始まりから鳴らす
    src.start(now, entry.oneShot ? 0 : (entry.loopStart ?? 0));
    const playing = { id, src, gain };
    src.onended = () => {
      if (this.current !== playing) return;
      this.current = null;
      // ジングルが鳴り終わったら、同じ id をもう一度指示できるようにする
      if (this.target === id) this.target = null;
    };
    this.current = playing;
  }

  /** 次に使う曲を先に読み込んでおく */
  preload(ids: readonly string[]): void {
    for (const id of ids) {
      const e = this.catalog.bgm.get(id);
      if (e) void this.buffers.get(e.url);
    }
  }
}
