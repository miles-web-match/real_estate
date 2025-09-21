export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

/* ---------- Helpers ---------- */
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

function hardCapJa(s: string, max: number) {
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
  return s.split(/[ ,、\s\n/]+/).map((w) => w.trim()).filter(Boolean);
};

const stripPriceAndSpaces = (s: string) =>
  s.replace(/(価格|金額|[一二三四五六七八九十百千万億兆\d０-９,，\.]+(?:億|万)?円)/g, "")
   .replace(/\s{2,}/g, " ").trim();

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripWords = (s: string, words: string[]) =>
  s.replace(new RegExp(`(${words.map(esc).join("|")})`, "g"), "");

/* ---------- NGワード ---------- */
const BANNED_HARD = [
  "完全","完ぺき","絶対","万全","100％","理想","日本一","日本初","業界一","No.1","一流","最高","最高級","最上級","極上",
  "地域でナンバーワン","抜群","特選","厳選","正統","至近","至便","特安","激安","掘出","破格","投売り","バーゲンセール",
];

/* ---------- 文ユーティリティ ---------- */
const SENTENCE_END = "[。\\.！？!？]";
const dropSentence = (src: string, re: RegExp) => src.replace(re, "");

/* ---------- CTA 強制除去（文ごと＋断片） ---------- */
function stripCTA(text: string) {
  const CTA_CORE = "(お問い合わせ|お問合せ|お問合わせ|問合せ|問い合わせ|ご連絡|ご相談|ご検討ください|ご検討を|資料請求|お申込|お申し込み|お申込み|お申し出|内覧|ご内覧|見学|ご見学|ご案内|予約|ご予約)";
  const VIEW = "(ご覧ください|ご覧になってみてください|ご覧になれます|現地をご覧|現地(見学|内覧))";
  let out = text;
  out = dropSentence(out, new RegExp(`(?:${CTA_CORE}|${VIEW})[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(new RegExp(`[^${SENTENCE_END}\\n]*?(?:${CTA_CORE}|${VIEW}|ぜひ[^${SENTENCE_END}\\n]*?(ご覧|検討))[^${SENTENCE_END}\\n]*?(?=${SENTENCE_END}|\\n|$)`, "g"), "");
  out = out.replace(/お気軽に(ご連絡|お問い合わせ)?ください/g, "");
  return out;
}

/* ---------- リフォーム/専有系 強制除去（文ごと＋断片） ---------- */
function stripRenoEverywhere(text: string) {
  const reno = "(リフォーム|リノベ|改装|改修|内装|新規|交換|更新|取替|張り替え|張替え|貼り替え|貼替え|設置|クリーニング|補修)";
  const interior = "(室内|居室|専有部|キッチン|浴室|トイレ|洗面|給湯器|建具|サッシ|フローリング|クロス|水回り|食洗機|浄水器|浴室乾燥機)";
  let out = text;
  // 文単位
  out = dropSentence(out, new RegExp(`${interior}[^${SENTENCE_END}]*${reno}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = dropSentence(out, new RegExp(`(最近\\s*)?${reno}[^${SENTENCE_END}]*?(完了|済み|予定)?[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = dropSentence(out, new RegExp(`(令和|平成)\\s*\\d+年\\s*\\d+月[^${SENTENCE_END}]*${reno}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  // 句点の無い末尾断片
  out = out.replace(new RegExp(`[^${SENTENCE_END}\\n]*?(最近\\s*)?${reno}[^${SENTENCE_END}\\n]*?(?=${SENTENCE_END}|\\n|$)`, "g"), "");
  // 「内装が新しく」「水回りが新しく」等
  out = dropSentence(out, new RegExp(`${interior}[^${SENTENCE_END}]*?(新し|一新|刷新)[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(/(リフォーム済み?|フルリノベ(ーション)?)/g, "");
  return out;
}

/* ---------- 棟専用フィルタ（強化版） ---------- */
function stripUnitSpecific(text: string) {
  let out = String(text || "");

  // 号室・階・方角
  out = out.replace(/\b\d{1,4}\s*号室\b/g, "");
  out = out.replace(/(所在|当該)?\s*([地上\d]+)階部分/g, "");
  out = out.replace(/(方位|方角|向き)\s*[:：]?\s*(南|東|西|北|南東|南西|北東|北西|東南|西南|東北|西北)/g, "");
  out = out.replace(/(南|東|西|北|南東|南西|北東|北西)\s*向(き)?/g, "");

  // 「お部屋は〜」など“住戸”前提の文を落とす
  out = dropSentence(out, new RegExp(`(お部屋|部屋|当住戸)[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));

  // 間取り/専有サイズ
  out = out.replace(/\b(間取り|間取|間口)\b[^\n。]*?/g, "");
  out = out.replace(/\b(\d+\s*(LDK|DK|K))\b/gi, "");
  out = out.replace(/[０-９]+\s*(ＬＤＫ|ＤＫ|Ｋ)/g, "");
  out = out.replace(/\b(1LDK|2LDK|3LDK|4LDK|5LDK|1DK|2DK|3DK|4DK|1K|2K|3K|4K)\b/gi, "");
  out = out.replace(/\b(ワンルーム|スタジオタイプ|メゾネット|ロフト)\b/g, "");

  // 面積（㎡/平米）と、その文（数字だけでなく 〇/○ も検出）
  const areaWords = "(専有面積|内法面積|バルコニー面積|テラス面積|ルーフバルコニー面積|広さ|面積|延べ)";
  const areaUnit  = "(㎡|m2|m²|平米)";
  out = dropSentence(out, new RegExp(`${areaWords}[^${SENTENCE_END}]*?${areaUnit}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(new RegExp(`[約\\s]*(?:[〇○]+)\\s*${areaUnit}`, "g"), "");
  out = out.replace(new RegExp(`\\b\\d{1,3}(?:[\\.,]\\d+)?\\s*${areaUnit}`, "g"), "");

  // バルコニー/テラス を含む文は落とす（向きの有無問わず）
  out = dropSentence(out, new RegExp(`(バルコニー|テラス)[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));

  // リフォーム関連 全面除去
  out = stripRenoEverywhere(out);

  // 価格・費用・募集/CTA
  const priceWords = "(価格|税込|消費税|管理費|修繕積立金|ローン|返済|頭金|ボーナス払い|家賃|賃料|月額)";
  out = dropSentence(out, new RegExp(`${priceWords}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = stripCTA(out);

  // 駐車場 在庫/月額など
  out = dropSentence(out, /駐車場[^。！？!?]*?(空き|空有|空無|募集中|残り\d+台|[0-9０-９]+台|月額)[^。！？!?]*[。！？!?]/g);

  out = out.replace(/。\s*。/g, "。").replace(/\s{2,}/g, " ").trim();
  return out;
}

/* ---------- 緩和表現（断定→配慮） ---------- */
function softenPhrases(text: string) {
  return text
    .replace(/日当たり(良好|抜群)/g, "日当たりに配慮")
    .replace(/通風(良好|抜群)/g, "通風に配慮")
    .replace(/眺望(良好|抜群)/g, "眺望に配慮")
    .replace(/静寂/g, "静けさに配慮")
    .replace(/閑静/g, "落ち着きのある環境を目指す計画")
    .replace(/抜群の利便性/g, "利便性に配慮")
    .replace(/(明るい住戸|明るい住空間|明るいお部屋|光を取り入れ|採光に優れ)/g, "採光に配慮")
    .replace(/(心地よい風|風通しが良い)/g, "通風に配慮")
    .replace(/治安(が)?良(い|好)/g, "地域の生活環境に配慮");
}

function stripFloorPlan(text: string) {
  const fp = ["ワンルーム","スタジオタイプ","メゾネット","ロフト","間取り","間取","間口","LDK","SLDK","SDK","LK","DK","K","1LDK","2LDK","3LDK","4LDK","5LDK","1DK","2DK","3DK","4DK","1K","2K","3K","4K"];
  return text.replace(new RegExp(fp.join("|"), "gi"), "");
}

function widenWalkingMinutes(text: string) {
  return text.replace(/徒歩(\d{1,2})分(?![~〜]\d)/g, (_m, p1) => {
    const base = Number(p1);
    if (!Number.isFinite(base)) return _m;
    return `徒歩${base}~${base + 2}分`;
  });
}

/* ---------- 規約準拠フィニッシュ ---------- */
function enforceKiyaku(text: string) {
  let out = stripUnitSpecific(text);
  out = stripWords(out, BANNED_HARD);
  out = out.replace(/新築/g, "");
  out = stripFloorPlan(out);
  out = widenWalkingMinutes(out);
  out = softenPhrases(out);
  // 念のため最終ゲート再適用
  out = stripRenoEverywhere(out);
  out = stripCTA(out);
  return out.replace(/。\s*。/g, "。").replace(/\s{2,}/g, " ").trim();
}

/* ---------- スタイルガイド ---------- */
function styleGuide(tone: string) {
  if (tone === "親しみやすい") return [
    "文体: やわらかい丁寧語。親近感を大切にし、専門用語は避ける。",
    "文長: 30〜60字中心。文末は「です」「ます」。",
    "禁止: 幼稚な接続（〜で、〜だから〜です）。",
  ].join("\n");
  if (tone === "一般的") return [
    "文体: 中立・説明的。事実ベースで読みやすさ重視。",
    "文長: 40〜70字中心。文末は「です」「ます」。",
    "禁止: 幼稚な接続。曖昧な断定。",
  ].join("\n");
  return [
    "文体: 上品・端正・落ち着いた調子。高級感ある広告コピー。",
    "文長: 40〜70字中心。体言止め1〜2文は許容。",
    "禁止: 幼稚な接続。誇張的最上級。",
  ].join("\n");
}

/* ---------- OpenAI ---------- */
async function openaiChat(apiKey: string, payload: any) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
  return r.json();
}

/* ---------- 長さ調整 & 校正 ---------- */
async function ensureLengthDescribe(apiKey: string, opts: { draft: string; context: string; min: number; max: number; tone: string; style: string; }) {
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
        { role: "system", content: 'Return ONLY {"text": string}. (json)\n' + `日本語・トーン:${opts.tone}\n${opts.style}\n` + `目的: ${opts.min}〜${opts.max}文字に${need === "expand" ? "増やす" : "収める"}。幼稚な接続禁止。価格/金額/URL/電話不可。` },
        { role: "user", content: JSON.stringify({ current_text: out, extracted_text: opts.context, action: need }) },
      ],
    });
    try { out = String(JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || out); } catch {}
    out = stripPriceAndSpaces(out);
    out = enforceKiyaku(out);
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
      { role: "system", content: 'Return ONLY {"text": string}. (json)\n' + `以下を校正。幼稚な接続禁止。体言止め/「〜を実現」「〜を提供します」も許容。トーン:${tone}\n${style}` },
      { role: "user", content: JSON.stringify({ current_text: text }) },
    ],
  });
  try { return JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || text; } catch { return text; }
}

/* ---------- Handler ---------- */
export const onRequestPost: PagesFunction = async (ctx) => {
  try {
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: "APIキー未設定" }), { status: 500 });

    const body = await ctx.request.json();
    const { name, url, mustWords = [], tone = "上品・落ち着いた", minChars = 450, maxChars = 550 } = body || {};
    if (!name || !url) return new Response(JSON.stringify({ error: "name/url必須" }), { status: 400 });

    const resp = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!resp.ok) return new Response(JSON.stringify({ error: "URL取得失敗" }), { status: 400 });
    const extracted_text = htmlToText(await resp.text()).slice(0, 40000);

    const STYLE = styleGuide(tone);

    const system =
      'Return ONLY {"text": string}. (json)\n' +
      [
        "あなたは日本語の不動産コピーライターです。",
        "出力はマンション“1棟”の紹介文に限定。室内/専有/リフォーム/間取り/価格/募集情報は書かない。",
        `トーン:${tone}。次のスタイルガイド遵守:\n${STYLE}`,
        `文字数:${minChars}〜${maxChars}（厳守）`,
      ].join("\n");

    const payload = { name, url, tone, extracted_text, must_words: normMustWords(mustWords), char_range: { min: minChars, max: maxChars } };

    const r1 = await openaiChat(OPENAI_API_KEY, {
      model: "gpt-4o-mini", temperature: 0.1, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
    });

    let text = ""; try { text = String(JSON.parse(r1.choices?.[0]?.message?.content || "{}")?.text || ""); } catch {}

    text = stripPriceAndSpaces(text);
    text = enforceKiyaku(text);

    text = await ensureLengthDescribe(OPENAI_API_KEY, { draft: text, context: extracted_text, min: minChars, max: maxChars, tone, style: STYLE });
    text = await polishJapanese(OPENAI_API_KEY, text, tone, STYLE);

    if (countJa(text) > maxChars) text = hardCapJa(text, maxChars);
    text = stripPriceAndSpaces(text);
    text = enforceKiyaku(text);

    return new Response(JSON.stringify({ text }), { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), { status: 500, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
};
