/**
 * 液晶の背景の絵を「動く一枚絵」にするシェーダ部品（stageShader に差し込む）。
 *
 * 絵（public/art/bg/*.webp）と奥行き（*.depth.webp、手前ほど白）を受け取り、
 * ゆっくりした寄り引き・奥行きの視差・光のにじみに、背景ごとの動き（魔法陣から広がる輪、
 * 嵐の渦と雷、RUSH の前進、海底の揺らめく光など）を重ねる。返す色はリニア。
 *
 * 背景の番号は stageShader の BACKDROPS の並び。
 */
export const artGlsl = /* glsl */ `
uniform sampler2D uArtA;
uniform sampler2D uDepA;
uniform float uArtAOk;
uniform sampler2D uArtB;
uniform sampler2D uDepB;
uniform float uArtBOk;
uniform float uArtAspect;

bool isId(float id, float k) { return abs(id - k) < 0.5; }
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec2 rot2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
vec3 artTap(sampler2D tex, vec2 q) { return toLin(texture2D(tex, clamp(q, 0.001, 0.999)).rgb); }

/** 絵の中で動きの中心になる所（魔法陣・太陽・渦・消失点など）。uv は下が 0 */
vec2 artFocus(float id) {
  if (isId(id, 0.0)) return vec2(0.2, 0.75);
  if (isId(id, 2.0)) return vec2(0.55, 0.82);
  if (isId(id, 3.0)) return vec2(0.5, 0.66);
  if (isId(id, 4.0)) return vec2(0.62, 0.8);
  if (isId(id, 5.0)) return vec2(0.75, 0.7);
  if (isId(id, 6.0)) return vec2(0.84, 0.9);
  if (isId(id, 7.0)) return vec2(0.55, 0.62);
  if (isId(id, 8.0)) return vec2(0.5, 0.58);
  return vec2(0.55, 0.62);
}

/**
 * 流れ続ける動き（回転・前進）を、位相を半周ずらした 2 枚の重ね合わせで途切れなく見せる。
 * kind 0: c の周りを回す（mask の所だけ）, 1: c へ向かって進む
 */
vec3 artFlow(sampler2D tex, vec2 q, vec2 c, float t, float speed, float amount, float mask, float kind) {
  float p0 = fract(t * speed);
  float p1 = fract(t * speed + 0.5);
  vec2 asp = vec2(uArtAspect, 1.0);
  vec2 v = (q - c) * asp;
  vec2 a0;
  vec2 a1;
  if (kind < 0.5) {
    float fall = exp(-length(v) * 2.2) * mask;
    a0 = c + rot2(v, -p0 * amount * fall) / asp;
    a1 = c + rot2(v, -p1 * amount * fall) / asp;
  } else {
    a0 = c + (q - c) / exp(p0 * amount);
    a1 = c + (q - c) / exp(p1 * amount);
  }
  return mix(artTap(tex, a0), artTap(tex, a1), abs(2.0 * p0 - 1.0));
}

/** 漂う光の粒。vel の向きに流れ、ところどころ瞬く。size はセルに対する半径 */
float bokeh(vec2 uv, float t, vec2 vel, float density, float size, float seed) {
  vec2 q = uv * vec2(uAspect, 1.0) * density - vel * t;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash2(id + seed);
  vec2 o = vec2(hash2(id + seed + 3.1), hash2(id + seed + 7.7)) - 0.5;
  float sway = sin(t * (0.7 + h) + h * 30.0) * 0.15;
  float d = length(f - o * 0.5 - vec2(sway, 0.0));
  float r = size * (0.4 + h * 0.6);
  float tw = 0.55 + 0.45 * sin(t * (1.5 + h * 3.0) + h * 50.0);
  return step(0.55, h) * smoothstep(r, r * 0.2, d) * tw;
}

/** 光源から伸びる光の筋 */
float godRays(vec2 uv, vec2 c, float t, float n, float speed) {
  vec2 p = (uv - c) * vec2(uAspect, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float rays = pow(0.5 + 0.5 * sin(a * n + t * speed), 6.0) * 0.6
             + pow(0.5 + 0.5 * sin(a * n * 0.47 - t * speed * 0.7 + 1.3), 8.0) * 0.4;
  return rays / (1.0 + r * 3.0);
}

/** 斜めに降る雨 */
float rain(vec2 uv, float t) {
  float x = (uv.x + uv.y * 0.18) * uAspect * 90.0;
  float col = floor(x);
  float h = hash(col * 1.37);
  float y = fract(uv.y * 1.6 + t * (2.2 + h * 1.4) + h * 10.0);
  float streak = smoothstep(0.0, 0.015, y) * smoothstep(0.14, 0.02, y);
  return step(0.62, h) * streak * smoothstep(0.5, 0.0, abs(fract(x) - 0.5));
}

/** 雷。ときどき 2 度瞬く。heat で増える */
float lightning(float t) {
  float s = t * (0.45 + uHeat * 0.6);
  float k = floor(s);
  float ph = fract(s) / (0.45 + uHeat * 0.6);
  float on = step(0.55, hash(k * 3.7 + 1.0));
  return on * (exp(-ph * 14.0) + 0.7 * step(0.12, ph) * exp(-(ph - 0.12) * 18.0));
}

/** 水の底に揺らめく光 */
float caustics(vec2 uv, float t) {
  vec2 p = uv * vec2(uAspect, 1.0) * 6.0;
  float a = noise(p + vec2(t * 0.35, t * 0.2));
  float b = noise(p * 1.3 - vec2(t * 0.27, -t * 0.18) + 4.0);
  return pow(1.0 - abs(a - b), 10.0);
}

/** RUSH の集中線。消失点から外へ流れる */
float speedLines(vec2 uv, vec2 c, float t) {
  vec2 p = (uv - c) * vec2(uAspect, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float seg = floor((a / TAU + 0.5) * 72.0);
  float h = hash(seg * 1.91);
  float s = fract(r * 1.4 - t * (1.6 + h * 1.8) * (1.0 + uHeat) + h * 7.0);
  float line = smoothstep(0.0, 0.04, s) * smoothstep(0.32, 0.04, s);
  float thin = smoothstep(0.5, 0.1, abs(fract((a / TAU + 0.5) * 72.0) - 0.5));
  return step(0.55, h) * line * thin * smoothstep(0.12, 0.55, r);
}

/** 背景ごとに重ねる光や天気。d は奥行き、far は遠景らしさ、lum はにじませた明るさ */
vec3 artFx(vec3 col, float id, vec2 uv, vec2 q, vec2 c, float d, float far, float lum, float t) {
  float heat = uHeat;
  if (isId(id, 0.0) || isId(id, 6.0)) {
    // 街の灯りの瞬き、空の星、漂う光
    float flick = noise(q * vec2(260.0, 190.0) + floor(t * 5.0) * 3.1);
    col *= 1.0 + (flick - 0.5) * 0.6 * smoothstep(0.25, 0.7, lum) * (1.0 - far);
    if (isId(id, 6.0)) {
      col += stars(uv * vec2(uAspect, 1.0), 55.0, t) * far * vec3(0.8, 0.85, 1.0) * 0.6;
      col += vec3(0.9, 0.9, 1.0) * 0.25 / (1.0 + length((uv - c) * vec2(uAspect, 1.0)) * 18.0) * (0.8 + 0.2 * sin(t * 1.3));
      col += bokeh(uv, t, vec2(0.25, 0.35), 9.0, 0.12, 4.0) * vec3(1.0, 0.55, 0.8) * 0.35;
    } else {
      col += godRays(uv, c, t * 0.4, 9.0, 0.3) * far * vec3(1.0, 0.65, 0.45) * 0.25;
      col += bokeh(uv, t, vec2(0.05, -0.12), 7.0, 0.1, 2.0) * vec3(1.0, 0.75, 0.55) * 0.3;
    }
  } else if (isId(id, 1.0)) {
    col *= 0.93 + 0.07 * hash(floor(t * 8.0));
    col += bokeh(uv, t, vec2(0.18, 0.1), 6.0, 0.14, 9.0) * vec3(0.9, 0.12, 0.15) * 0.45;
    col += bokeh(uv, t, vec2(-0.1, 0.22), 10.0, 0.08, 11.0) * vec3(1.0, 0.85, 0.4) * 0.3;
  } else if (isId(id, 2.0)) {
    // 空の紋から光の輪が広がる（下から見上げた楕円）
    float e = length((q - c) * vec2(uArtAspect, 2.6));
    for (int i = 0; i < 2; i++) {
      float ph = fract(t * (0.35 + heat * 0.4) + float(i) * 0.5);
      col += vec3(1.0, 0.45, 0.78) * smoothstep(0.05, 0.0, abs(e - ph * 1.5)) * (1.0 - ph) * 0.9 * far;
    }
    col += vec3(1.0, 0.5, 0.8) * (0.5 + 0.5 * sin(t * 2.2)) * 0.35 / (1.0 + e * 9.0);
    col += bokeh(uv, t, vec2(0.12, 0.3), 7.0, 0.12, 5.0) * vec3(1.0, 0.35, 0.55) * 0.5;
  } else if (isId(id, 3.0)) {
    col += godRays(uv, c, t, 14.0, 0.5 + heat) * vec3(1.0, 0.82, 0.45) * (0.3 + heat * 0.3);
    col += bokeh(uv, t, vec2(0.0, -0.18), 9.0, 0.1, 6.0) * vec3(1.0, 0.92, 0.7) * 0.7;
    col += stars(uv * vec2(uAspect, 1.0), 34.0, t * 2.0) * vec3(1.0, 0.9, 0.6) * 0.8;
  } else if (isId(id, 4.0)) {
    // 絶望の嵐: 渦・雷・雨・地平の赤い脈
    float bolt = lightning(t);
    col += vec3(0.75, 0.6, 1.0) * bolt * (0.35 + far * 0.9) * 0.6;
    col += vec3(0.85, 0.85, 1.0) * rain(uv, t) * 0.18;
    float horizon = smoothstep(0.25, 0.0, abs(uv.y - 0.52));
    col += vec3(0.9, 0.05, 0.1) * horizon * (0.15 + 0.15 * sin(t * 1.7)) * (0.5 + heat);
    col += bokeh(uv, t, vec2(0.05, 0.25), 8.0, 0.08, 7.0) * vec3(1.0, 0.25, 0.1) * 0.4;
  } else if (isId(id, 5.0)) {
    // 時計塔: 月明かりの中を光る塵がゆっくり降り、灯の粒が漂う
    col += bokeh(uv, t, vec2(0.02, -0.12), 9.0, 0.09, 8.0) * vec3(0.8, 0.65, 1.0) * 0.45;
    col += bokeh(uv, t, vec2(0.08, -0.08), 5.0, 0.07, 12.0) * vec3(0.9, 0.9, 1.0) * 0.35;
    float g = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(g) * vec3(0.9, 0.92, 1.05), 0.25 * exp(-fract(t) * 6.0));
  } else if (isId(id, 7.0)) {
    // 海の底の遺跡: 上から差す光、揺らめく光、昇る泡
    col += vec3(0.3, 0.8, 1.0) * caustics(q, t) * (0.25 + d * 0.3);
    col += godRays(uv, vec2(0.5, 1.25), t * 0.3, 11.0, 0.4) * vec3(0.5, 0.85, 1.0) * 0.45;
    col += bokeh(uv, t, vec2(0.0, 0.3), 10.0, 0.09, 13.0) * vec3(0.7, 0.95, 1.0) * 0.4;
  } else if (isId(id, 8.0)) {
    col += speedLines(uv, c, t) * vec3(1.0, 0.8, 1.0) * (0.5 + heat * 0.5);
    col += vec3(1.0, 0.7, 0.95) * 0.35 / (1.0 + length((uv - c) * vec2(uAspect, 1.0)) * 7.0);
  }
  return col;
}

/** 絵の背景。奥行きで視差をつけ、寄り引き・流れを加えてから背景ごとの効果を重ねる */
vec3 artScene(sampler2D tex, sampler2D dep, float id, vec2 uv, float t) {
  vec2 c = artFocus(id);
  float seed = id * 1.37 + 0.5;
  float heat = uHeat;
  // 液晶（約 4:3）に絵を cover で収める
  vec2 q0 = vec2(uv.x, (uv.y - 0.5) * uArtAspect / uAspect + 0.5);
  // ゆっくり寄り引きしながら漂う。時計塔は 1 秒ごとに針が進むように小さく寄る
  float z = 1.1 + 0.03 * sin(t * 0.06 + seed) + heat * 0.04;
  if (isId(id, 5.0)) z += 0.006 * exp(-fract(t) * 9.0);
  vec2 pan = vec2(sin(t * 0.043 + seed), cos(t * 0.031 + seed * 2.1)) * 0.012;
  vec2 q = (q0 - c) / z + c + pan;
  // 奥行きの視差: 手前ほど大きくずれる
  vec2 sway = vec2(sin(t * 0.23 + seed), sin(t * 0.19 + seed * 3.0) * 0.5) * (0.012 + heat * 0.01);
  vec2 base = q;
  for (int i = 0; i < 3; i++) q = base + sway * (texture2D(dep, q).r - 0.4);
  float d = texture2D(dep, q).r;
  float far = 1.0 - smoothstep(0.12, 0.4, d);

  if (isId(id, 1.0)) {
    // 影の帳: 1/8 秒ごとに線が震える（作画の揺れ）
    float k = floor(t * 8.0);
    q += (vec2(noise(q * 9.0 + k * 1.7), noise(q * 9.0 + k * 2.3 + 5.0)) - 0.5) * 0.003;
  } else if (isId(id, 7.0)) {
    q += vec2(sin(q.y * 26.0 + t * 1.3), cos(q.x * 21.0 + t * 1.1)) * 0.0022;
  }

  vec3 col;
  if (isId(id, 8.0)) col = artFlow(tex, q, c, t, 0.32 * (1.0 + heat * 0.8), 0.32, 1.0, 1.0);
  else if (isId(id, 4.0)) col = artFlow(tex, q, c, t, 0.05 * (1.0 + heat), 1.1, far, 0.0);
  else col = artTap(tex, q);

  // 明るい所をにじませる（アニメの撮影処理の光）
  vec3 soft = toLin(texture2D(tex, clamp(q, 0.001, 0.999), 3.5).rgb);
  float bloomK = (isId(id, 3.0) || isId(id, 8.0)) ? 0.35 : (isId(id, 1.0) || isId(id, 4.0)) ? 0.3 : 0.5;
  col += max(soft - 0.3, 0.0) * bloomK * (0.7 + heat * 0.6);
  float lum = dot(soft, vec3(0.2126, 0.7152, 0.0722));

  col = artFx(col, id, uv, q, c, d, far, lum, t);

  // 熱いほど色を立てる。明るい所は白く飛ばさず肩で丸める
  float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(y), col, 1.0 + heat * 0.18), 0.0);
  vec3 over = max(col - 0.6, 0.0);
  return min(col, 0.6) + over / (1.0 + over * 2.5);
}
`;
