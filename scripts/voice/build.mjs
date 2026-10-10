/**
 * 演出のボイスを VOICEVOX で書き出し、ffmpeg でパチンコの実況らしく加工する。
 *   node scripts/voice/build.mjs [id ...]   （id を渡すとその台詞だけ書き直す。エンジンの URL は VOICEVOX_URL）
 * 出力: public/audio/voice/<id>.mp3 と manifest.json。ffmpeg（asoftclip の threshold を使うので 4.4 以降）が PATH にあること。
 *
 * 役は 8 つ。実況などの 4 役と、灯守 4 人（しずくは heroine が兼ねる）。
 * - mc: 実況（青山龍星 熱血）。リーチ・激アツ・当たりを叫ぶ。低域を足し、強く潰して、短い反響を付ける
 * - heroine: 灯守役（中部つるぎ 怒り）。復活・決め台詞。しずくの声も兼ねる
 * - rose / violet / amber / scarlet: カットインとラウンドの台詞をそれぞれの声で言う
 *   （こはる = 東北ずん子、すみれ = 離途 シリアス、ゆずは = 四国めたん、あかね = 九州そら ツンツン）
 * - soft: 落ち着いた女声（冥鳴ひまり）。ハズレ・ようこそ・RUSH 終了
 * - guide: 案内（No.7 アナウンス）。打ち方の指示。加工は軽く、はっきり聞こえるように
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENGINE = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
const OUT = "public/audio/voice";
/** 読点の間の上限（秒） */
const MAX_PAUSE = 0.3;
/**
 * 叫び（実況の「！」で終わる台詞）。最後の母音を伸ばし、最後の句が平板なら終わりの 2 拍の高さを少しずつ上げる。
 * 高さはエンジンの対数 F0 に足す量。下がり目のある句を上げると「リーチ」が「りい↑ち」になる
 */
const SHOUT_LIFT = [0.04, 0.09];
const SHOUT_STRETCH = 1.3;
/**
 * 下がり目のある句で、最後の拍を下がり目の拍からこれだけは下げる。エンジンの推定だと「ワン」の
 * ン（4.71 → 4.59）のように下げ幅が小さく、伸ばすと平らに聞こえる。「リーチ」のチは 0.24 下がっていて足りている
 */
const SHOUT_DROP = 0.25;
/** 下がり目のある句で、下がり目の拍をこれだけ上げる（「ワ↑ン↓」「リ↑ーチ↓」の山を高くする） */
const SHOUT_PEAK = 0.12;

const ROLE = {
  mc: { speaker: 81, speed: 1.08, pitch: -0.02, intonation: 1.5, chain: "mc" },
  heroine: { speaker: 95, speed: 1.05, pitch: 0.0, intonation: 1.4, chain: "heroine" },
  rose: { speaker: 107, speed: 1.05, pitch: 0.02, intonation: 1.4, chain: "heroine" },
  violet: { speaker: 101, speed: 1.0, pitch: 0.0, intonation: 1.1, chain: "heroine" },
  amber: { speaker: 2, speed: 1.0, pitch: -0.01, intonation: 1.25, chain: "heroine" },
  scarlet: { speaker: 18, speed: 1.08, pitch: 0.0, intonation: 1.45, chain: "heroine" },
  soft: { speaker: 14, speed: 1.0, pitch: 0.0, intonation: 1.15, chain: "soft" },
  guide: { speaker: 30, speed: 1.05, pitch: 0.0, intonation: 1.0, chain: "guide" },
};

/**
 * id: [役, 台詞, 速さの倍率, 読み]。id は src/audio/audio.ts の VoiceId と対応する。
 * 読みはアクセント付きのカナ（' が下がり目、/ が句の切れ目、、 が間）。エンジンの推定だと読み違える
 * （灯ヶ丘・主）か、アクセントが崩れる台詞にだけ書く。叫びは台詞の「！」から作る（shout）ので、
 * 台詞に「ッ」や「ぇ」を足して叫ばせない（句が割れてアクセントがおかしくなる）
 */
const LINES = {
  welcome: ["soft", "灯ヶ丘へ、ようこそ。", 1, "ヒガ'オカエ、ヨ'オコソ"],
  reach: ["mc", "リーチ！", 1.05, "リ'イチ"],
  next: ["mc", "ネクスト！", 1.1],
  gekiatsu: ["mc", "激アツ！！", 1, "ゲキア'ツ"],
  cutinBlue_rose: ["rose", "わたしも、がんばる！", 1],
  cutinRed_rose: ["rose", "みんなを、守りたいの！", 1],
  cutinGold_rose: ["rose", "これが、わたしの願い！！", 0.95],
  cutinBlue_violet: ["violet", "……まだ、終わらない。", 1],
  cutinRed_violet: ["violet", "今度こそ、決着をつける。", 1],
  cutinGold_violet: ["violet", "もう、迷わない！！", 0.95],
  cutinBlue_azure: ["heroine", "まだ、いける！", 1],
  cutinRed_azure: ["heroine", "ここで、決める！", 1],
  cutinGold_azure: ["heroine", "絶対に、負けない！！", 0.95],
  cutinBlue_amber: ["amber", "落ち着いて。まだ、これからよ。", 1, "オチツ'イテ、マ'ダ、コレカラヨ'"],
  cutinRed_amber: ["amber", "わたしに、任せなさい！", 1],
  cutinGold_amber: ["amber", "これで、決めるわよ！！", 0.95],
  cutinBlue_scarlet: ["scarlet", "へっ、まだまだ！", 1, "ヘ'ッ、マ'ダマダア"],
  cutinRed_scarlet: ["scarlet", "いくぜ！", 1, "イクゼ'エ"],
  cutinGold_scarlet: ["scarlet", "全部、ぶっ飛ばしてやる！！", 0.95, "ゼ'ンブ、ブットバ'シテヤル"],
  sp: ["mc", "スーパーリーチ！", 1],
  spStorm: ["mc", "黒嵐、降臨！！", 0.95, "コクラン'、コオリン'"],
  spAbyss: ["mc", "深淵の主！！", 0.95, "シンエンノヌ'シ"],
  spStory: ["mc", "ストーリーリーチ！！", 0.95],
  push: ["mc", "押せ！！", 1, "オセ'"],
  lever: ["mc", "レバーを、引け！！", 1, "レ'バアオ、ヒケ'"],
  hit: ["mc", "大当たり！！", 0.95, "オオアタリ'"],
  revival: ["heroine", "まだ、終わってない！！", 1],
  miss: ["soft", "そんな……", 0.9],
  sudden: ["heroine", "えっ……！？", 1],
  zenkaiten: ["mc", "全回転！！", 0.9, "ゼンカ'イテン"],
  lantern: ["mc", "ひもりボーナス！！", 1, "ヒモリボ'オナス"],
  challenge: ["mc", "チャレンジボーナス！", 1],
  rightShoot: ["guide", "右打ちしてください。", 1],
  round_rose: ["rose", "どんどん、狙ってこう！", 1, "ド'ンドン、ネラッテコ'オ"],
  round_violet: ["violet", "そのまま、狙い続けて。", 1, "ソノママ'、ネライツズケテ'"],
  round_azure: ["heroine", "どんどん、狙って！", 1],
  round_amber: ["amber", "その調子よ。しっかり狙ってね。", 1],
  round_scarlet: ["scarlet", "ガンガン、いこうぜ！", 1],
  rush: ["mc", "灯火ラッシュ、突入！！", 0.95, "トモシビラ'ッシュ、トツニュウ'"],
  promote: ["heroine", "チャレンジ成功！ 灯火ラッシュへ！", 1],
  challengeFail: ["soft", "チャレンジ失敗……。また、挑もう。", 1],
  lt: ["mc", "オーロラ、超ラッシュ！！", 0.95, "オ'オロラ、チョオラ'ッシュ"],
  upper: ["mc", "三千発、確定！！", 0.95, "サンゼ'ンパツ、カクテエ'"],
  rushHit: ["mc", "継続！！", 1, "ケエゾク'"],
  rushEnd: ["soft", "ラッシュ終了。おつかれさま。", 1, "ラ'ッシュ/シュウリョオ'、オツカレサマ'"],
  leftShoot: ["guide", "左打ちに戻してください。", 1],
  count3: ["mc", "スリー！", 1.1],
  count2: ["mc", "ツー！", 1.1],
  count1: ["mc", "ワン！", 1.1, "ワ'ン"],
};

/**
 * 加工の最後に揃える音の大きさ（LUFS）。loudnorm は 3 秒より短い台詞だと測り切れずに台詞ごとに 5 dB ほど
 * ばらつくので、書き出したあとに測り直して足りない分を一律に上げ下げする（postprocess）
 */
const LUFS = { mc: -13, heroine: -14, soft: -16, guide: -15 };
/** 測り直したあとに上げ下げする量の上限（dB）。これを超えるのは加工か測定がおかしい */
const MAX_TRIM = 8;

/**
 * 加工の連鎖。
 * 実況は「近くで叫んで、会場の PA から返ってくる」音にする: 低域とプレゼンスを足し、強く潰して歪ませ、
 * 少しずらした複製（ダブリング）と短い反響を混ぜる。最後にラウドネスを揃える。
 */
const CHAIN = {
  mc: [
    "highpass=f=70",
    "bass=g=5:f=120",
    "equalizer=f=2800:t=q:w=1.2:g=4",
    "acompressor=threshold=-24dB:ratio=8:attack=3:release=90:makeup=6",
    "asoftclip=type=tanh:threshold=0.7",
    "asplit=2[a][b];[b]adelay=18,asetrate=48000*0.985,aresample=48000,volume=0.45[d];[a][d]amix=inputs=2:normalize=0",
    "aecho=0.85:0.55:70|140|230:0.32|0.2|0.12",
    `loudnorm=I=${LUFS.mc}:TP=-1:LRA=7`,
  ],
  heroine: [
    "highpass=f=110",
    "equalizer=f=3500:t=q:w=1.2:g=3",
    "acompressor=threshold=-22dB:ratio=5:attack=4:release=100:makeup=4",
    "aecho=0.8:0.45:55|120:0.25|0.14",
    `loudnorm=I=${LUFS.heroine}:TP=-1:LRA=7`,
  ],
  soft: [
    "highpass=f=100",
    "acompressor=threshold=-24dB:ratio=3:attack=8:release=150:makeup=3",
    "aecho=0.8:0.5:90|200:0.22|0.12",
    `loudnorm=I=${LUFS.soft}:TP=-1.5:LRA=7`,
  ],
  guide: ["highpass=f=120", "acompressor=threshold=-22dB:ratio=3:attack=6:release=120:makeup=3", `loudnorm=I=${LUFS.guide}:TP=-1.5:LRA=7`],
};

/** アクセント付きのカナから句を作る。読みの誤りはエンジンが 400 で返す */
async function kanaPhrases(speaker, kana) {
  const res = await fetch(`${ENGINE}/accent_phrases?speaker=${speaker}&is_kana=true&text=${encodeURIComponent(kana)}`, { method: "POST" });
  if (!res.ok) throw new Error(`accent_phrases ${res.status}: ${kana}: ${await res.text()}`);
  return res.json();
}

/** 最後の句の終わりを伸ばし、平板なら上げ、下がり目があれば山を上げてはっきり下げる（叫び）。無声の拍（高さ 0）は上げも伸ばしもしない */
function shout(phrases) {
  const last = phrases.at(-1);
  const moras = last?.moras ?? [];
  if (!moras.length) return;
  const end = moras.at(-1);
  if (last.accent === moras.length) {
    SHOUT_LIFT.forEach((lift, i) => {
      const m = moras[moras.length - SHOUT_LIFT.length + i];
      if (m && m.pitch > 0) m.pitch += lift;
    });
  } else {
    const peak = moras[last.accent - 1];
    const before = peak.pitch;
    if (peak.pitch > 0) peak.pitch += SHOUT_PEAK;
    if (end.pitch > 0) end.pitch = Math.min(end.pitch, before - SHOUT_DROP);
  }
  if (end.pitch > 0) end.vowel_length *= SHOUT_STRETCH;
}

async function synth(role, text, speedMul, kana) {
  const r = ROLE[role];
  const q = await fetch(`${ENGINE}/audio_query?speaker=${r.speaker}&text=${encodeURIComponent(text)}`, { method: "POST" });
  if (!q.ok) throw new Error(`audio_query ${q.status}: ${text}`);
  const query = await q.json();
  if (kana) query.accent_phrases = await kanaPhrases(r.speaker, kana);
  if (r.chain === "mc" && /[！!]$/.test(text)) shout(query.accent_phrases);
  // 読点の間はエンジンの推定に任せると「へっ、」の後などで 1 秒を超えることがあるので詰める
  for (const ap of query.accent_phrases) if (ap.pause_mora) ap.pause_mora.vowel_length = Math.min(ap.pause_mora.vowel_length, MAX_PAUSE);
  query.speedScale = r.speed * speedMul;
  query.pitchScale = r.pitch;
  query.intonationScale = r.intonation;
  query.volumeScale = 1.3;
  query.prePhonemeLength = 0.03;
  query.postPhonemeLength = 0.12;
  query.outputSamplingRate = 48000;
  const s = await fetch(`${ENGINE}/synthesis?speaker=${r.speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis ${s.status}: ${text}`);
  return Buffer.from(await s.arrayBuffer());
}

/** 反響の尾が切れないよう後ろに無音を足してから加工し、末尾の無音だけを詰める（台詞の間は残す） */
function postprocess(wav, mp3, chain) {
  const tmp = `${wav}.fx.wav`;
  const filter = `[0:a]apad=pad_dur=0.6,${CHAIN[chain].join(",")},areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse[out]`;
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-filter_complex", filter, "-map", "[out]", "-ac", "1", "-ar", "48000", tmp]);
    const trim = LUFS[chain] - integratedLoudness(tmp);
    // 測れずに NaN になったときも止めたいので、範囲内であることを確かめる形で書く
    if (!(Math.abs(trim) <= MAX_TRIM)) throw new Error(`${mp3}: 音量の補正が ${trim.toFixed(1)} dB になる`);
    const fix = `volume=${trim.toFixed(2)}dB,alimiter=limit=0.89:attack=2:release=40:level=disabled`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-af", fix, "-ac", "1", "-ar", "48000", "-b:a", "96k", mp3]);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** ffmpeg の ebur128 で測った音の大きさ（LUFS） */
function integratedLoudness(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...r.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop();
  if (r.status !== 0 || !m) throw new Error(`${file}: 音の大きさを測れない`);
  return Number(m[1]);
}

const only = new Set(process.argv.slice(2));
const unknown = [...only].filter((id) => !(id in LINES));
if (unknown.length) throw new Error(`unknown voice id: ${unknown.join(", ")}`);
mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [id, [role, text, speed, kana]] of Object.entries(LINES)) {
  manifest.push({ id, file: `${id}.mp3`, role, text });
  if (only.size && !only.has(id)) continue;
  const wav = join(OUT, `${id}.wav`);
  writeFileSync(wav, await synth(role, text, speed, kana));
  try {
    postprocess(wav, join(OUT, `${id}.mp3`), ROLE[role].chain);
  } finally {
    rmSync(wav);
  }
  console.log(`${id} [${role}]: ${text}`);
}
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
