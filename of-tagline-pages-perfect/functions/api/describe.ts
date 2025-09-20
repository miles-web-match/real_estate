
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
};

// ---- Helpers & pipeline (trimmed comments for brevity) ----
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
  s.replace(/(価格|金額|[一二三四五六七八九十百千万億兆\d０-９,，\.]+(?:億|万)?円)/g, "").replace(/\s{2,}/g, " ").trim();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripWords = (s: string, words: string[]) => s.replace(new RegExp(`(${words.map(esc).join("|")})`, "g"), "");

const BANNED = ["完全","完ぺき","絶対","万全","100％","フルリフォーム","理想","日本一","日本初","業界一","超","当社だけ","他に類を見ない",
"抜群","一流","秀逸","羨望","屈指","特選","厳選","正統","由緒正しい","地域でナンバーワン","最高","最高級","極","特級","最新",
"最適","至便","至近","一級","絶好","買得","掘出","土地値","格安","投売り","破格","特安","激安","安値","バーゲンセール",
"ディズニー","ユニバーサルスタジオ","歴史ある","歴史的","歴史的建造物","由緒ある"];

function softenEnvPhrases(text: string) {
  return text
    .replace(/日当たり(良好|抜群)/g, "日当たりに配慮")
    .replace(/通風(良好|抜群)/g, "通風に配慮")
    .replace(/眺望(良好|抜群)/g, "眺望に配慮")
    .replace(/静寂/g, "静けさに配慮")
    .replace(/抜群の利便性/g, "利便性に配慮");
}
const KIYAKU_RULES: {name: string; re: RegExp; fix?: (m: string)=>string}[] = [
  { name: "比較最上級", re: /(日本一|業界一|最高級?|最上級|極上|No\.?1)/g },
  { name: "価格誤認", re: /(掘出|破格|特売|特安|激安|安値|バーゲン(セール)?|投売り|買得)/g },
  { name: "環境利便_強表現", re: /(日当たり(良好|抜群)|通風(良好|抜群)|眺望(良好|抜群)|静寂|抜群の利便性)/g, fix: (m) => softenEnvPhrases(m) },
  { name: "断定保証", re: /(絶対|必ず|100％|完璧|万全|保証|間違いなく)/g, fix: () => "配慮された" },
  { name: "新築断定", re: /新築/g },
  { name: "徒歩分表現", re: /徒歩\d{1,2}分/g },
];
function enforceKiyaku(text: string) {
  let out = text;
  for (const rule of KIYAKU_RULES) out = rule.fix ? out.replace(rule.re, (m)=>rule.fix!(m)) : out.replace(rule.re, "");
  out = softenEnvPhrases(out);
  return out.replace(/\s{2,}/g, " ").trim();
}
function styleGuide(tone: string): string {
  if (tone === "親しみやすい") return [
    "文体: 親しみやすく、やわらかい丁寧語。誇張・絵文字・感嘆記号は抑制。",
    "構成: ①立地・雰囲気 ②敷地/外観の印象 ③アクセス ④共用/サービス ⑤日常シーンを想起させる結び。",
    "語彙例: 「〜がうれしい」「〜を感じられます」「〜にも便利」「〜に寄り添う」。",
    "文長: 30〜60字中心。",
    "文末は「です」「ます」で統一。不自然な文法は禁止。"
  ].join("\n");
  if (tone === "一般的") return [
    "文体: 中立・説明的で読みやすい丁寧語。事実ベースで誇張を避ける。",
    "構成: ①全体概要 ②規模/デザイン ③アクセス ④共用/管理 ⑤まとめ。",
    "語彙例: 「〜に位置」「〜を採用」「〜が整う」「〜を提供」。",
    "文長: 40〜70字中心。",
    "文末は「です」「ます」で統一。不自然な文法は禁止。"
  ].join("\n");
  return [
    "文体: 上品・落ち着いた・事実ベース。過度な誇張や感嘆記号は避ける。",
    "構成: ①全体コンセプト/立地 ②敷地規模・ランドスケープ ③建築/保存・デザイン ④交通アクセス ⑤共用/サービス ⑥結び。",
    "語彙例: 「〜という全体コンセプトのもと」「〜を実現」「〜に相応しい」「〜がひろがる」「〜を提供します」。",
    "文長: 40〜70字中心。体言止めは1〜2文に留める。",
    "文末は「です」「ます」で統一。不自然な文法は禁止。"
  ].join("\n");
}
async function openaiChat(apiKey: string, payload: any): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ensureLengthDescribe(apiKey: string, opts: { draft: string; context: string; min: number; max: number; tone: string; style: string; }) {
  let out = opts.draft || "";
  for (let i=0;i<3;i++){
    const len = countJa(out);
    if (len>=opts.min && len<=opts.max) return out;
    const need = len < opts.min ? "expand" : "condense";
    const r = await openaiChat(apiKey, {
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role:"system", content: 'Return ONLY {"text": string}. (json)\n' + `日本語・トーン:${opts.tone}。次のスタイルガイドを遵守：\n${opts.style}\n` + `目的: 文字数を${opts.min}〜${opts.max}（全角）に${need==="expand"?"増やし":"収め"}る。\n` + "事実が不足する場合は一般的で安全な叙述で補い、固有の事実を創作しない。価格/金額/円/万円・電話番号・URLは禁止。" },
        { role:"user", content: JSON.stringify({ current_text: out, extracted_text: opts.context, action: need }) }
      ]
    });
    try{ out = String(JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || out);}catch{}
    out = stripPriceAndSpaces(out); out = stripWords(out, BANNED); out = enforceKiyaku(out);
    if (countJa(out) > opts.max) out = hardCapJa(out, opts.max);
  }
  return out;
}
async function polishJapanese(apiKey: string, text: string, tone: string, style: string) {
  const r = await openaiChat(apiKey, {
    model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
    messages: [
      { role:"system", content: 'Return ONLY {"text": string}. (json)\n' + `以下の日本語を校正。文末は「です」「ます」。体言止めは最大2文。トーン:${tone}\n${style}` },
      { role:"user", content: JSON.stringify({ current_text: text }) }
    ]
  });
  try { return JSON.parse(r.choices[0].message?.content||"{}")?.text || text; } catch { return text; }
}

export const onRequestPost: PagesFunction = async (ctx) => {
  try {
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), { status: 500 });

    const body = await ctx.request.json();
    const { name, url, mustWords = [], tone = "上品・落ち着いた", minChars = 450, maxChars = 550, referenceExamples = [] as string[] } = body || {};
    if (!name || !url) return new Response(JSON.stringify({ error: "name / url は必須です" }), { status: 400 });

    const resp = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!resp.ok) return new Response(JSON.stringify({ error: `URL取得失敗 (${resp.status})` }), { status: 400 });
    const extracted_text = htmlToText(await resp.text()).slice(0, 40000);

    const STYLE_GUIDE = styleGuide(tone);
    let STYLE_ANCHORS = "";
    if (referenceExamples.length > 0) {
      const r0 = await openaiChat(OPENAI_API_KEY, {
        model:"gpt-4o-mini", temperature:0, response_format:{type:"json_object"},
        messages:[
          { role:"system", content:'Return ONLY {"rules": string}. 日本語。例文の共通スタイルを要約: 1) 段落構成 2) 文長 3) 言い回し 4) 語彙トーン 5) 接続詞 6) 体言止め 7) 避ける表現' },
          { role:"user", content: JSON.stringify({ examples: referenceExamples.slice(0,5) }) }
        ]
      });
      try { STYLE_ANCHORS = JSON.parse(r0.choices?.[0]?.message?.content||"{}")?.rules || ""; } catch {}
    }

    const system =
      'Return ONLY a json object like {"text": string}. (json)\n' + [
        "あなたは日本語の不動産コピーライターです。",
        `トーン: ${tone}。次のスタイルガイドに従う。`,
        STYLE_GUIDE,
        STYLE_ANCHORS ? `\n---\n【Style Anchors】\n${STYLE_ANCHORS}\n---` : "",
        `文字数は【厳守】${minChars}〜${maxChars}（全角）。`,
        "事実ベース。価格/金額/円/万円・電話番号・外部URLは禁止。",
        `禁止語を使わない：${BANNED.join("、")}`,
        "ビル名（name）は2回程度自然に含める。過度な連呼は禁止。"
      ].join("\n");

    const payload = {
      name, url, tone, extracted_text,
      must_words: normMustWords(mustWords),
      char_range: { min: minChars, max: maxChars },
      must_include: { name_times: 2, transport_times: 1, fields: ["階建","総戸数","建物構造","分譲会社","施工会社","管理会社"] },
      do_not_include: ["リフォーム内容","方位","面積","お問い合わせ文言", ...BANNED],
    };

    const r1 = await openaiChat(OPENAI_API_KEY, {
      model:"gpt-4o-mini", temperature:0.1, response_format:{type:"json_object"},
      messages:[ { role:"system", content: system }, { role:"user", content: JSON.stringify(payload) } ]
    });
    let text = ""; try { text = String(JSON.parse(r1.choices?.[0]?.message?.content||"{}")?.text || ""); } catch {}

    text = stripPriceAndSpaces(text); text = stripWords(text, BANNED); text = enforceKiyaku(text);

    if (referenceExamples.length > 0) {
      const review = await openaiChat(OPENAI_API_KEY, {
        model:"gpt-4o-mini", temperature:0, response_format:{type:"json_object"},
        messages:[
          { role:"system", content:'Return ONLY {"score": number, "rewrite": string}. 日本語。適合度1〜5点。4未満ならrewriteで上書き。' },
          { role:"user", content: JSON.stringify({ current_text: text, examples: referenceExamples.slice(0,5), tone, style_guide: STYLE_GUIDE, anchors: STYLE_ANCHORS, banned: BANNED, range: {min: minChars, max: maxChars} }) }
        ]
      });
      try{ const j = JSON.parse(review.choices?.[0]?.message?.content||"{}"); if (typeof j.score==="number" && j.score<4 && j.rewrite) text = String(j.rewrite);}catch{}
      text = stripPriceAndSpaces(text); text = stripWords(text, BANNED); text = enforceKiyaku(text);
    }

    text = await ensureLengthDescribe(OPENAI_API_KEY, { draft: text, context: extracted_text, min: minChars, max: maxChars, tone, style: STYLE_GUIDE + (STYLE_ANCHORS?`\n${STYLE_ANCHORS}`:"") });
    text = await polishJapanese(OPENAI_API_KEY, text, tone, STYLE_GUIDE + (STYLE_ANCHORS?`\n${STYLE_ANCHORS}`:""));
    if (countJa(text) > maxChars) text = hardCapJa(text, maxChars);
    text = stripPriceAndSpaces(text); text = stripWords(text, BANNED); text = enforceKiyaku(text);

    return new Response(JSON.stringify({ text }), { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), { status: 500, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
};
