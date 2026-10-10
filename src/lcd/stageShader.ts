import { artGlsl } from "./artShader";

/**
 * 液晶の合成シェーダ。背景（9 種）は同梱の絵を動かして敷き（絵が読めるまではコードで描いた
 * 背景）、手元の映像があればその上に敷き、2D の文字・図柄を重ね、
 * 衝撃波・フラッシュ・ズームパンチ・色ずれを上からかける。
 *
 * 出力はリニア（レンダーターゲットへ書くので sRGB 変換はしない）。
 */

export const BACKDROPS = ["city", "barrier", "circle", "gold", "despair", "clock", "night", "abyss", "rush"] as const;
export type Backdrop = (typeof BACKDROPS)[number];

export const stageVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const stageFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uUi;
uniform float uTime;
uniform float uAspect;
uniform float uSceneA;
uniform float uSceneB;
uniform float uMix;
uniform float uHeat;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uWave;
uniform vec3 uWaveColor;
uniform float uPunch;
uniform sampler2D uVid0;
uniform float uVid0W;
uniform vec2 uVid0S;
uniform sampler2D uVid1;
uniform float uVid1W;
uniform vec2 uVid1S;
uniform float uUiAlpha;

const float TAU = 6.28318530718;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float ring(float r, float rad, float w) { return smoothstep(w, 0.0, abs(r - rad)); }

/** 星のまたたき。セルごとに 1 つ */
float stars(vec2 uv, float density, float t) {
  vec2 q = uv * density;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash2(id);
  vec2 o = vec2(hash2(id + 3.1), hash2(id + 7.7)) - 0.5;
  float d = length(f - o * 0.6);
  float tw = 0.5 + 0.5 * sin(t * (2.0 + h * 4.0) + h * 40.0);
  return step(0.82, h) * smoothstep(0.06, 0.0, d) * tw;
}

/* ---- 0: 灯ヶ丘の夕景 ---- */
vec3 city(vec2 uv, float t) {
  float y = uv.y;
  vec3 col = mix(vec3(1.0, 0.56, 0.42), vec3(0.62, 0.3, 0.62), smoothstep(0.18, 0.55, y));
  col = mix(col, vec3(0.13, 0.08, 0.32), smoothstep(0.55, 1.0, y));
  float c = fbm(vec2(uv.x * 2.6 + t * 0.015, y * 7.0));
  col = mix(col, vec3(1.0, 0.78, 0.84), smoothstep(0.55, 0.85, c) * smoothstep(0.25, 0.7, y) * 0.55);
  col += stars(uv * vec2(uAspect, 1.0), 40.0, t) * smoothstep(0.6, 0.95, y) * 0.9;
  // 遠いビル（薄い）と近いビル（窓明かり）
  float bxF = floor(uv.x * 46.0);
  float hF = 0.16 + hash(bxF * 1.3) * 0.16;
  col = mix(col, vec3(0.42, 0.24, 0.5), step(y, hF) * 0.8);
  float bx = floor(uv.x * 22.0);
  float h = 0.08 + hash(bx) * 0.16 + step(0.86, hash(bx + 7.0)) * 0.18;
  if (y < h) {
    vec2 w = vec2(uv.x * 22.0 * 5.0, y * 70.0);
    vec2 wf = fract(w);
    float lit = step(0.55, hash2(floor(w) + bx)) * step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.7);
    col = vec3(0.07, 0.04, 0.14) + lit * vec3(1.0, 0.78, 0.45) * 0.7;
    // 屋上の縁を光らせる
    col += vec3(1.0, 0.5, 0.6) * smoothstep(0.006, 0.0, h - y) * 0.6;
  }
  return col;
}

/* ---- 1: 影の帳（切り絵のコラージュ） ---- */
vec3 petalPalette(float h) {
  if (h < 0.25) return vec3(0.16, 0.38, 0.18);
  if (h < 0.5) return vec3(0.72, 0.1, 0.12);
  if (h < 0.75) return vec3(0.86, 0.66, 0.16);
  return vec3(0.95, 0.9, 0.82);
}

vec3 barrier(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float n = fbm(uv * 5.0 + vec2(t * 0.03, 0.0));
  vec3 col = mix(vec3(0.82, 0.7, 0.48), vec3(0.42, 0.28, 0.18), n);
  // 手前に流れる市松の床
  float horizon = 0.4;
  if (uv.y < horizon) {
    float z = horizon / (horizon - uv.y + 0.015);
    vec2 f = vec2(p.x * z * 1.4, z + t * (0.9 + uHeat));
    float ch = mod(floor(f.x) + floor(f.y), 2.0);
    vec3 floorCol = ch > 0.5 ? vec3(0.08, 0.06, 0.05) : vec3(0.92, 0.86, 0.74);
    col = mix(col, floorCol, smoothstep(0.0, 0.08, horizon - uv.y) * 0.9);
  }
  // 薔薇・蝶に見える切り絵を 3 層で漂わせる
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = p * (2.6 + fi * 1.7) + vec2(t * 0.12 * (fi + 1.0), sin(t * 0.4 + fi) * 0.3);
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash2(id + fi * 17.0);
    if (h > 0.42) {
      float a = atan(f.y, f.x) + t * (h - 0.6) * 2.4;
      float r = length(f);
      float petals = floor(3.0 + h * 6.0);
      float shape = 0.3 * (0.62 + 0.38 * cos(petals * a));
      float m = smoothstep(shape, shape - 0.015, r);
      float edge = smoothstep(shape + 0.03, shape, r) - m;
      col = mix(col, vec3(0.04, 0.03, 0.02), edge);
      col = mix(col, petalPalette(hash(h * 91.0)), m);
      col = mix(col, vec3(0.04), smoothstep(0.05, 0.03, r) * m);
    }
  }
  // 落書きのような線
  float s = abs(sin(p.x * 9.0 + sin(p.y * 13.0 + t) * 1.2) * 0.5 - p.y * 0.4 - 0.1);
  col = mix(col, vec3(0.05, 0.03, 0.02), smoothstep(0.012, 0.0, s) * 0.8);
  // 縁を焼く
  col *= 1.0 - smoothstep(0.35, 0.95, length(p * vec2(0.8, 1.2))) * 0.75;
  return col;
}

/* ---- 2: 魔法陣 ---- */
float rune(vec2 g, float seed) {
  vec2 gi = floor(g * vec2(3.0, 4.0));
  vec2 gf = fract(g * vec2(3.0, 4.0));
  float h = hash(seed * 13.0 + gi.x * 3.0 + gi.y * 7.0);
  float line = 0.0;
  if (h < 0.33) line = smoothstep(0.16, 0.0, abs(gf.y - 0.5));
  else if (h < 0.66) line = smoothstep(0.16, 0.0, abs(gf.x - 0.5));
  else if (h < 0.8) line = smoothstep(0.16, 0.0, abs(gf.x - gf.y));
  return line;
}

float hexagram(vec2 p, float rad, float rot) {
  float d = 1e3;
  for (int k = 0; k < 6; k++) {
    float th = rot + float(k) * TAU / 6.0 + (mod(float(k), 2.0) > 0.5 ? TAU / 12.0 : 0.0);
    float th2 = rot + floor(float(k) / 2.0) * TAU / 3.0 + (mod(float(k), 2.0) > 0.5 ? TAU / 6.0 : 0.0);
    d = min(d, abs(dot(p, vec2(cos(th2), sin(th2))) - rad * 0.5));
  }
  return smoothstep(0.005, 0.0, d) * step(length(p), rad);
}

vec3 circle(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = mix(vec3(0.42, 0.03, 0.26), vec3(0.04, 0.0, 0.07), smoothstep(0.0, 0.75, r));
  col += vec3(1.0, 0.35, 0.65) * 0.3 / (1.0 + r * 9.0);
  float speed = 0.25 + uHeat * 0.6;
  vec3 line = vec3(1.0, 0.78, 0.92);
  col += line * (ring(r, 0.44, 0.007) + ring(r, 0.37, 0.005) + ring(r, 0.23, 0.005) + ring(r, 0.47, 0.003) * 0.6);
  float ar = a + t * speed;
  float u = (ar / TAU + 0.5) * 40.0;
  float seg = floor(u);
  float band = (r - 0.37) / 0.07;
  if (band > 0.18 && band < 0.82) col += line * rune(vec2(fract(u), (band - 0.18) / 0.64), seg) * 0.9;
  col += line * hexagram(p, 0.37, -t * speed * 0.7) * 0.8;
  float spokes = smoothstep(0.02, 0.0, abs(fract((a - t * speed * 0.4) / TAU * 12.0) - 0.5) * 0.1) * step(0.47, r) * step(r, 0.6);
  col += vec3(1.0, 0.5, 0.75) * spokes * 0.5;
  col += stars(uv * vec2(uAspect, 1.0), 30.0, t) * 0.6;
  return col;
}

/* ---- 3: 金の後光 ---- */
vec3 gold(vec2 uv, float t) {
  vec2 p = (uv - vec2(0.5, 0.52)) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * sin(a * 18.0 + t * 1.8), 3.0);
  float rays2 = pow(0.5 + 0.5 * sin(a * 7.0 - t * 1.1), 2.0);
  vec3 col = mix(vec3(0.45, 0.12, 0.02), vec3(1.0, 0.72, 0.18), rays * 0.65 + rays2 * 0.35);
  col *= 1.5 / (1.0 + r * 2.4);
  col += vec3(1.0, 0.95, 0.82) * 0.7 / (1.0 + r * 12.0);
  col += stars(uv * vec2(uAspect, 1.0), 26.0, t * 2.0) * vec3(1.0, 0.9, 0.6) * 1.2;
  return col;
}

/* ---- 4: 絶望（赤黒） ---- */
vec3 despair(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float n = fbm(p * 3.0 + vec2(fbm(p * 2.0 + t * 0.2), t * 0.1));
  vec3 col = mix(vec3(0.02, 0.0, 0.01), vec3(0.55, 0.02, 0.05), smoothstep(0.35, 0.8, n));
  // ひび割れ
  float ridge = 1.0 - abs(noise(p * 7.0 + t * 0.05) * 2.0 - 1.0);
  col = mix(col, vec3(0.0), smoothstep(0.92, 0.98, ridge));
  col += vec3(1.0, 0.1, 0.1) * smoothstep(0.985, 1.0, ridge) * 0.8;
  col *= 1.0 - smoothstep(0.3, 0.9, length(p)) * 0.8;
  return col;
}

/* ---- 5: 時計（時間停止） ---- */
vec3 clock(vec2 uv, float t) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = mix(vec3(0.22, 0.24, 0.36), vec3(0.03, 0.03, 0.08), smoothstep(0.0, 0.8, r));
  vec3 line = vec3(0.75, 0.82, 1.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float rad = 0.18 + fi * 0.13;
    float rot = t * (0.3 - fi * 0.2) * (1.0 + uHeat);
    float ticks = smoothstep(0.08, 0.0, abs(fract((a + rot) / TAU * (24.0 + fi * 24.0)) - 0.5) - 0.42);
    col += line * (ring(r, rad, 0.004) * 0.9 + ticks * step(rad - 0.03, r) * step(r, rad) * 0.7);
  }
  // 針
  for (int k = 0; k < 2; k++) {
    float th = -t * (k == 0 ? 0.6 : 0.08) + 1.2;
    vec2 dir = vec2(cos(th), sin(th));
    float along = dot(p, dir);
    float side = abs(dot(p, vec2(-dir.y, dir.x)));
    float len = k == 0 ? 0.42 : 0.28;
    col += line * smoothstep(0.006, 0.0, side) * step(0.0, along) * step(along, len) * 1.2;
  }
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  return mix(vec3(g), col, 0.6);
}

/** 手元の映像（sRGB のまま来るのでリニアに直す）。s は液晶への収め方。外は黒 */
vec3 video(sampler2D tex, vec2 uv, vec2 s) {
  vec2 q = (uv - 0.5) * s + 0.5;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  return pow(texture2D(tex, clamp(q, 0.0, 1.0)).rgb, vec3(2.2)) * inside;
}

${artGlsl}

/** コードで描く背景（sRGB）。夜景・海底・RUSH は近いものを代わりに使う */
vec3 procScene(float id, vec2 uv, float t) {
  if (id < 0.5 || isId(id, 6.0)) return city(uv, t);
  if (id < 1.5) return barrier(uv, t);
  if (id < 2.5) return circle(uv, t);
  if (id < 3.5) return gold(uv, t);
  if (id < 4.5 || isId(id, 7.0)) return despair(uv, t);
  return clock(uv, t);
}

/** 背景 1 枚（リニア）。絵が読めていれば絵、読めるまではコードで描いたもの */
vec3 scene(float id, sampler2D art, sampler2D dep, float ok, vec2 uv, float t) {
  vec3 col = ok < 0.999 ? toLin(max(procScene(id, uv, t), 0.0)) : vec3(0.0);
  if (ok > 0.001) col = mix(col, artScene(art, dep, id, uv, t), ok);
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;

  // 映像が全面を覆っている間は、コードの背景を描かない
  vec3 back = vec3(0.0);
  if (max(uVid0W, uVid1W) < 0.999) {
    back = uMix < 0.999 ? scene(uSceneA, uArtA, uDepA, uArtAOk, uv, t) : vec3(0.0);
    if (uMix > 0.001) back = mix(back, scene(uSceneB, uArtB, uDepB, uArtBOk, uv, t), uMix);
  }
  if (uVid0W > 0.001) back = mix(back, video(uVid0, uv, uVid0S), uVid0W);
  if (uVid1W > 0.001) back = mix(back, video(uVid1, uv, uVid1S), uVid1W);

  // 2D の層。パンチで寄り、衝撃波の輪で押し出す
  vec2 c = uv - 0.5;
  float z = 1.0 - uPunch * 0.07;
  vec2 uvU = c * z + 0.5;
  if (uWave >= 0.0) {
    float rad = uWave * 1.5;
    float d = length(p) - rad;
    float push = exp(-d * d * 400.0) * (1.0 - clamp(uWave / 0.8, 0.0, 1.0));
    uvU -= normalize(c + 1e-5) * push * 0.02;
  }
  float ca = uPunch * 0.006 + uFlash * 0.003;
  vec4 ui = texture2D(uUi, uvU);
  float uiR = texture2D(uUi, uvU + vec2(ca, 0.0)).r;
  float uiB = texture2D(uUi, uvU - vec2(ca, 0.0)).b;
  ui.rgb = vec3(uiR, ui.g, uiB);
  vec3 col = mix(back, ui.rgb, ui.a * uUiAlpha);

  if (uWave >= 0.0) {
    float rad = uWave * 1.5;
    float d = abs(length(p) - rad);
    float fade = 1.0 - clamp(uWave / 0.8, 0.0, 1.0);
    col += uWaveColor * (smoothstep(0.05, 0.0, d) * 2.5 + smoothstep(0.25, 0.0, d) * 0.4) * fade;
  }
  col = mix(col, uFlashColor * 1.6, clamp(uFlash, 0.0, 1.0));
  col *= 1.0 - smoothstep(0.55, 1.0, length(c * vec2(1.0, 1.25))) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;
