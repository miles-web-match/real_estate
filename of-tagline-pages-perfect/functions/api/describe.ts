// ==== Cloudflare Pages Functions: POST /api/describe ====
// 必要環境変数: OPENAI_API_KEY

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

/* ---------- Utils ---------- */
function htmlToText(html: string) {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const countJa = (s: string) => Array.from(s || "").length;
function hardCapJa(s: string, max: number): string {
  const arr = Array.from(s || "");
  if (arr.length <= max) return s;
  const upto = arr.slice(0, max);
  const enders = new Set(["。", "！", "？", "."]);
  let cut = -1;
  for (let i = upto.length - 1; i >= 0; i--) {
    if (enders.has(upto[i])) { cut = i + 1; break; }
  }
  return upto.slice(0, cut > 0 ? cut : max).join("").trim();
}
const normMustWords = (src: unknown): string[] => {
  const s: string = Array.isArray(src) ? (src as unknown[]).map(String).join(" ") : String(src ?? "");
  return s.split(/[ ,、\s\n/]+/).map(w => w.trim()).filter(Boolean);
};
const stripPriceAndSpaces = (s: string) =>
  s.replace(/(価格|金額|[一二三四五六七八九十百千万億兆\d０-９,，\.]+(?:億|万)?円)/g, "")
   .replace(/\s{2,}/g, " ").trim();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripWords = (s: string, words: string[]) =>
  s.replace(new RegExp(`(${words.map(esc).join("|")})`, "g"), "");

/* ---------- 規約ベースの禁止/緩和ルール ---------- */
/** 強い優良誤認や最上級は削除。静寂/利便性などは“柔らかく言い換え”。 */
const BANNED_HARD = [
  "完全","完ぺき","絶対","万全","100％","理想","日本一","日本初","業界一","No.1","一流","最高","最高級","最上級","極上",
  "地域でナンバーワン","抜群","特選","厳選","正統","至近","至便","特安","激安","掘出","破格","投売り","バーゲンセール",
];

/** “言い切り”を避ける緩和マップ（断定→配慮/傾向） */
const SOFT_MAP: Array<[RegExp, string]> = [
  // 環境・快適性
  [/日当たり(良好|抜群)/g, "日当たりに配慮"],
  [/通風(良好|抜群)/g, "通風に配慮"],
  [/眺望(良好|抜群)/g, "眺望に配慮"],
  [/静寂/g, "静けさに配慮"],
  [/閑静/g, "落ち着きのある環境を目指す計画"],
  [/騒音なし/g, "騒音対策に配慮"],
  // 利便性
  [/抜群の利便性/g, "利便性に配慮"],
  [/利便性(が高い|最高)/g, "利便性に配慮"],
  [/アクセス(至便|抜群)/g, "アクセスしやすい立地"],
  // 比較優位の断定
  [/(日本一|業界一|No\.?1|トップクラス)/g, "適切な水準"],
  // 保証・断定的効果
  [/(必ず|間違いなく|保証|万全)/g, "配慮されています"],
];

/** 徒歩X分 → 徒歩X~(X+2)分（すでに幅表記があるものはそのまま） */
function widenWalkingMinutes(text: string) {
  return text.replace(/徒歩(\d{1,2})分(?![~〜]\d)/g, (_m, p1) => {
    const base = Number(p1);
    if (!Number.isFinite(base)) return _m;
    const hi = base + 2;
    return `徒歩${base}~${hi}分`;
  });
}

/** フレーズ緩和 */
function softenPhrases(text: string) {
  let out = text;
  for (const [re, rep] of SOFT_MAP) out = out.replace(re, rep);
  return out;
}

/** 規約準拠クリーニング（柔らかい言い換え重視） */
function enforceKiyaku(text: string) {
  let out = text;

  // 強い禁止語は削除
  out = stripWords(out, BANNED_HARD);

  // “新築”断定は避ける（建築年等の事実が無い限り）
  out = out.replace(/新築/g, "");

  // 徒歩表現は「幅を持たせる」
  out = widenWalkingMinutes(out);

  // フレーズ緩和
  out = softenPhrases(out);

  // 仕上げ
  return out.replace(/\s{2,}/g, " ").trim();
}

/* ---------- トーン/スタイル ---------- */
function styleGuide(tone: string): string {
  if (tone === "親しみやすい") {
    return [
      "文体: 親しみやすく、やわらかい丁寧語。誇張・感嘆は抑制。",
      "構成: ①立地・雰囲気 ②敷地/外観 ③アクセス ④共用/サービス ⑤暮らしの情景。",
      "文長: 30〜60字中心。文末は「です」「ます」。"
    ].join("\n");
  }
  if (tone === "一般的") {
    return [
      "文体: 中立・説明的。事実ベースで誇張を避ける。",
      "構成: ①概要 ②規模/デザイン ③アクセス ④共用/管理 ⑤まとめ。",
      "文長: 40〜70字中心。文末は「です」「ます」。"
    ].join("\n");
  }
  return [
    "文体: 上品・落ち着いた。過度な誇張や断定は避ける。",
    "構成: ①コンセプト/立地 ②ランドスケープ ③建築/保存 ④交通 ⑤共用/サービス ⑥結び。",
    "文長: 40〜70字中心。体言止めは1〜2文まで。文末は「です」「ます」。"
  ].join("\n");
}

/* ---------- OpenAI（REST） ---------- */
async function openaiChat(apiKey: string, payload: any): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
  return r.json();
}

/* ---------- 長さ矯正 / 校正 / 美文 ---------- */
async function ensureLengthDescribe(
  apiKey: string,
  opts: { draft: string; context: string; min: number; max: number; tone: string; style: string }
) {
  let out = opts.draft || "";
  for (let i = 0; i < 3; i++) {
    const len = countJa(out);
    if (len >= opts.min && len <= opts.max) return out;
    const need = len < opts.min ? "expand" : "condense";
    const r = await openaiChat(apiKey, {
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return ONLY {"text": string}. (json)\n' +
            `日本語・トーン:${opts.tone}。次のスタイルガイドを遵守：\n${opts.style}\n` +
            `目的: 文字数を${opts.min}〜${opts.max}（全角）に${need === "expand" ? "増やし" : "収め"}る。\n` +
            "事実不足は一般的な叙述で補完。価格/金額/円/万円・電話番号・URLは禁止。",
        },
        { role: "user", content: JSON.stringify({ current_text: out, extracted_text: opts.context, action: need }) },
      ],
    });
    try {
      out = String(JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || out);
    } catch {}
    out = stripPriceAndSpaces(out);
    out = enforceKiyaku(out); // 規約準拠・緩和
    if (countJa(out) > opts.max) out = hardCapJa(out, opts.max);
  }
  return out;
}

async function polishJapanese(apiKey: string, text: string, tone: string, style: string) {
  const r = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return ONLY {"text": string}. (json)\n' +
          `以下の日本語を校正。文末は「です」「ます」。体言止めは最大2文。トーン:${tone}\n${style}`,
      },
      { role: "user", content: JSON.stringify({ current_text: text }) },
    ],
  });
  try {
    return JSON.parse(r.choices[0].message?.content || "{}")?.text || text;
  } catch {
    return text;
  }
}

/** 最終「美文」ステップ：自然で美しいが“誇張はしない” */
async function beautifyElegant(apiKey: string, text: string, tone: string) {
  const r = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return ONLY {"text": string}. (json)\n' +
          "目標: 文章を自然で美しい日本語へ整える。上品・端正・読みやすさ重視。\n" +
          "禁止: 事実の創作・最上級・断定的効能・価格/金額・電話・URL。\n" +
          "指針: 過度な形容は避け、情報の順序と論理を整え、余計な重複を削る。",
      },
      { role: "user", content: JSON.stringify({ current_text: text, tone }) },
    ],
  });
  try {
    return JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || text;
  } catch {
    return text;
  }
}

/* ---------- Handler ---------- */
export const onRequestPost: PagesFunction = async (ctx) => {
  try {
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if (!OPENAI_API_KEY)
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), { status: 500 });

    const body = await ctx.request.json();
    const {
      name,
      url,
      mustWords = [],
      tone = "上品・落ち着いた",
      minChars = 450,
      maxChars = 550,
      referenceExamples = [] as string[],
    } = body || {};

    if (!name || !url)
      return new Response(JSON.stringify({ error: "name / url は必須です" }), { status: 400 });

    // 対象ページから本文抽出
    const resp = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!resp.ok)
      return new Response(JSON.stringify({ error: `URL取得失敗 (${resp.status})` }), { status: 400 });
    const extracted_text = htmlToText(await resp.text()).slice(0, 40000);

    const STYLE_GUIDE = styleGuide(tone);

    // 例文スタイル抽出（任意）
    let STYLE_ANCHORS = "";
    if (referenceExamples.length > 0) {
      const r0 = await openaiChat(OPENAI_API_KEY, {
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return ONLY {"rules": string}. 日本語。例文群の共通スタイルを要約: 1) 段落構成 2) 文長 3) 言い回し 4) 語彙トーン 5) 接続詞 6) 体言止め 7) 避ける表現',
          },
          { role: "user", content: JSON.stringify({ examples: referenceExamples.slice(0, 5) }) },
        ],
      });
      try {
        STYLE_ANCHORS = JSON.parse(r0.choices?.[0]?.message?.content || "{}")?.rules || "";
      } catch {}
    }

    // ① 初稿
    const system =
      'Return ONLY {"text": string}. (json)\n' +
      [
        "あなたは日本語の不動産コピーライターです。",
        `トーン: ${tone}。次のスタイルガイドに従う。`,
        STYLE_GUIDE,
        STYLE_ANCHORS ? `\n---\n【Style Anchors】\n${STYLE_ANCHORS}\n---` : "",
        `文字数は【厳守】${minChars}〜${maxChars}（全角）。`,
        "事実ベース。価格/金額/円/万円・電話番号・外部URLは禁止。",
        "ビル名（name）は2回程度自然に含める。過度な連呼は禁止。",
        "誇張・最上級・比較優位の断定は禁止。状況依存の表現は“配慮/傾向”に言い換える。",
      ].join("\n");

    const payload = {
      name,
      url,
      tone,
      extracted_text,
      must_words: normMustWords(mustWords),
      char_range: { min: minChars, max: maxChars },
      must_include: {
        name_times: 2,
        transport_times: 1,
        fields: ["階建", "総戸数", "建物構造", "分譲会社", "施工会社", "管理会社"],
      },
      do_not_include: ["リフォーム内容", "方位", "面積", "お問い合わせ文言", ...BANNED_HARD],
    };

    const r1 = await openaiChat(OPENAI_API_KEY, {
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
    });
    let text = "";
    try {
      text = String(JSON.parse(r1.choices?.[0]?.message?.content || "{}")?.text || "");
    } catch {}

    // ② 規約準拠クリーニング（柔らかい言い換え重視）
    text = stripPriceAndSpaces(text);
    text = enforceKiyaku(text);

    // ③ 例文に合わせた微調整（任意）
    if (referenceExamples.length > 0) {
      const review = await openaiChat(OPENAI_API_KEY, {
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return ONLY {"score": number, "rewrite": string}. 日本語。適合度1〜5点。4未満ならrewriteで上書き。',
          },
          {
            role: "user",
            content: JSON.stringify({
              current_text: text,
              examples: referenceExamples.slice(0, 5),
              tone,
              style_guide: STYLE_GUIDE,
              anchors: STYLE_ANCHORS,
              range: { min: minChars, max: maxChars },
            }),
          },
        ],
      });
      try {
        const j = JSON.parse(review.choices?.[0]?.message?.content || "{}");
        if (typeof j.score === "number" && j.score < 4 && j.rewrite) text = String(j.rewrite);
      } catch {}
      text = enforceKiyaku(text);
    }

    // ④ 長さ矯正 → ⑤ 日本語校正 → ⑥ 美文化
    text = await ensureLengthDescribe(OPENAI_API_KEY, {
      draft: text,
      context: extracted_text,
      min: minChars,
      max: maxChars,
      tone,
      style: STYLE_GUIDE + (STYLE_ANCHORS ? `\n${STYLE_ANCHORS}` : ""),
    });
    text = await polishJapanese(
      OPENAI_API_KEY,
      text,
      tone,
      STYLE_GUIDE + (STYLE_ANCHORS ? `\n${STYLE_ANCHORS}` : "")
    );
    text = await beautifyElegant(OPENAI_API_KEY, text, tone);

    // 仕上げ（安全側）
    if (countJa(text) > maxChars) text = hardCapJa(text, maxChars);
    text = stripPriceAndSpaces(text);
    text = enforceKiyaku(text);

    return new Response(JSON.stringify({ text }), {
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), {
      status: 500,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
