export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

/* describe と同じヘルパー・フィルタをそのまま複製 */
const SENTENCE_END = "[。\\.！？!？]";
const dropSentence = (src: string, re: RegExp) => src.replace(re, "");
const countJa = (s: string) => Array.from(s || "").length;
function hardCapJa(s: string, max: number) {
  const arr = Array.from(s || ""); if (arr.length <= max) return s;
  const upto = arr.slice(0, max); const enders = new Set(["。","！","？","."]);
  let cut = -1; for (let i = upto.length - 1; i >= 0; i--) { if (enders.has(upto[i])) { cut = i + 1; break; } }
  return upto.slice(0, cut > 0 ? cut : max).join("").trim();
}
const stripPriceAndSpaces = (s: string) =>
  s.replace(/(価格|金額|[一二三四五六七八九十百千万億兆\d０-９,，\.]+(?:億|万)?円)/g, "").replace(/\s{2,}/g, " ").trim();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripWords = (s: string, words: string[]) => s.replace(new RegExp(`(${words.map(esc).join("|")})`, "g"), "");
const BANNED_HARD = ["完全","完ぺき","絶対","万全","100％","理想","日本一","日本初","業界一","No.1","一流","最高","最高級","最上級","極上","地域でナンバーワン","抜群","特選","厳選","正統","至近","至便","特安","激安","掘出","破格","投売り","バーゲンセール"];

function stripCTA(text: string) {
  const cta="(お問い合わせ|お問合せ|内覧|見学|ご案内|予約|お気軽に(ご連絡|お問い合わせ)?ください|ぜひ[^。!?]*?(ご覧|検討)|お待ちしております)";
  let out = dropSentence(text, new RegExp(`${cta}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(new RegExp(`[^${SENTENCE_END}\\n]*?(?:${cta})[^${SENTENCE_END}\\n]*?(?=${SENTENCE_END}|\\n|$)`, "g"), "");
  return out;
}
function stripRenoEverywhere(text: string) {
  const reno="(リフォーム|リノベ|改装|改修|内装|新規|交換|取替|張り替え|張替え|貼り替え|貼替え|設置|クリーニング|補修)";
  const interior="(室内|居室|専有部|キッチン|浴室|トイレ|洗面|給湯器|建具|サッシ|フローリング|クロス|食洗機|浄水器|浴室乾燥機)";
  let out = text;
  out = dropSentence(out, new RegExp(`${interior}[^${SENTENCE_END}]*${reno}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = dropSentence(out, new RegExp(`(最近\\s*)?${reno}[^${SENTENCE_END}]*?(完了|済み|予定)?[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = dropSentence(out, new RegExp(`(令和|平成)\\s*\\d+年\\s*\\d+月[^${SENTENCE_END}]*${reno}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(new RegExp(`[^${SENTENCE_END}\\n]*?(最近\\s*)?${reno}[^${SENTENCE_END}\\n]*?(?=${SENTENCE_END}|\\n|$)`, "g"), "");
  out = out.replace(/(リフォーム済み?|フルリノベ(ーション)?)/g, "");
  return out;
}

function stripUnitSpecific(text: string) {
  let out = String(text || "");
  out = out.replace(/\b\d{1,4}\s*号室\b/g, "");
  out = out.replace(/(所在|当該)?\s*([地上\d]+)階部分/g, "");
  out = out.replace(/(方位|方角|向き)\s*[:：]?\s*(南|東|西|北|南東|南西|北東|北西|東南|西南|東北|西北)/g, "");
  out = out.replace(/(南|東|西|北|南東|南西|北東|北西)\s*向(き)?/g, "");
  out = out.replace(/\b(間取り|間取|間口)\b[^\n。]*?/g, "");
  out = out.replace(/\b(\d+\s*(LDK|DK|K))\b/gi, "");
  out = out.replace(/[０-９]+\s*(ＬＤＫ|ＤＫ|Ｋ)/g, "");
  out = out.replace(/\b(1LDK|2LDK|3LDK|4LDK|5LDK|1DK|2DK|3DK|4DK|1K|2K|3K|4K)\b/gi, "");
  out = out.replace(/\b(ワンルーム|スタジオタイプ|メゾネット|ロフト)\b/g, "");
  const areaWords="(専有面積|内法面積|バルコニー面積|テラス面積|ルーフバルコニー面積|テラス|バルコニー)";
  const areaUnit="(㎡|m2|m²|平米)";
  out = dropSentence(out, new RegExp(`${areaWords}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = out.replace(new RegExp(`\\b\\d{1,3}(?:[\\.,]\\d+)?\\s*${areaUnit}`, "g"), "");
  out = stripRenoEverywhere(out);
  const priceWords="(価格|税込|消費税|管理費|修繕積立金|ローン|返済|頭金|ボーナス払い|家賃|賃料|月額)";
  out = dropSentence(out, new RegExp(`${priceWords}[^${SENTENCE_END}]*${SENTENCE_END}`, "g"));
  out = stripCTA(out);
  out = dropSentence(out, /駐車場[^。！？!?]*?(空き|空有|空無|募集中|残り\d+台|[0-9０-９]+台|月額)[^。！？!?]*[。！？!?]/g);
  out = out.replace(/(バルコニー|テラス)[^\n。]{0,16}(南|東|西|北|南東|南西|北東|北西)\s*向(き)?/g, "");
  out = out.replace(/。\s*。/g, "。").replace(/\s{2,}/g, " ").trim();
  return out;
}

function softenPhrases(text: string) {
  return text
    .replace(/日当たり(良好|抜群)/g, "日当たりに配慮")
    .replace(/通風(良好|抜群)/g, "通風に配慮")
    .replace(/眺望(良好|抜群)/g, "眺望に配慮")
    .replace(/静寂/g, "静けさに配慮")
    .replace(/閑静/g, "落ち着きのある環境を目指す計画")
    .replace(/抜群の利便性/g, "利便性に配慮")
    .replace(/(明るい住戸|明るい住空間|光を取り入れ|採光に優れ)/g, "採光に配慮")
    .replace(/(心地よい風|風通しが良い)/g, "通風に配慮")
    .replace(/治安(が)?良(い|好)/g, "地域の生活環境に配慮");
}
function stripFloorPlan(text: string) {
  const fp=["ワンルーム","スタジオタイプ","メゾネット","ロフト","間取り","間取","間口","LDK","SLDK","SDK","LK","DK","K","1LDK","2LDK","3LDK","4LDK","5LDK","1DK","2DK","3DK","4DK","1K","2K","3K","4K"];
  return text.replace(new RegExp(fp.join("|"), "gi"), "");
}
function widenWalkingMinutes(text: string) {
  return text.replace(/徒歩(\d{1,2})分(?![~〜]\d)/g, (_m, p1)=>`徒歩${Number(p1)}~${Number(p1)+2}分`);
}
function enforceKiyaku(text: string) {
  let out = stripUnitSpecific(text);
  out = stripWords(out, BANNED_HARD);
  out = out.replace(/新築/g, "");
  out = stripFloorPlan(out);
  out = widenWalkingMinutes(out);
  out = softenPhrases(out);
  out = stripRenoEverywhere(out);
  out = stripCTA(out);
  return out.replace(/。\s*。/g,"。").replace(/\s{2,}/g," ").trim();
}

/* ---------- Style / OpenAI / Length & Polish ---------- */
function styleGuide(tone: string) {
  if (tone === "親しみやすい") return [
    "文体: やわらかい丁寧語。親近感を大切にし、専門用語は避ける。","文長: 30〜60字中心。","禁止: 幼稚な接続。"
  ].join("\n");
  if (tone === "一般的") return [
    "文体: 中立・説明的。事実ベースで読みやすさ重視。","文長: 40〜70字中心。","禁止: 幼稚な接続。曖昧な断定。"
  ].join("\n");
  return [
    "文体: 上品・端正・落ち着いた調子。高級感ある広告コピー。","文長: 40〜70字中心。体言止め1〜2文は許容。","禁止: 幼稚な接続。"
  ].join("\n");
}
async function openaiChat(apiKey: string, payload: any) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ensureLength(apiKey: string, opts:{draft:string; min:number; max:number; tone:string; style:string;}) {
  let out = opts.draft || "";
  for (let i=0;i<3;i++){
    const len = countJa(out);
    if (len>=opts.min && len<=opts.max) return out;
    const need = len < opts.min ? "expand" : "condense";
    const r = await openaiChat(apiKey, {
      model:"gpt-4o-mini", temperature:0.1, response_format:{type:"json_object"},
      messages:[
        { role:"system", content:'Return ONLY {"text": string}. (json)\n' + `日本語・トーン:${opts.tone}\n${opts.style}\n` + `目的:${opts.min}〜${opts.max}文字に${need==="expand"?"増やす":"収める"}。幼稚な接続禁止。価格/URL/電話不可。` },
        { role:"user", content: JSON.stringify({ current_text: out, action: need }) }
      ]
    });
    try{ out = String(JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || out);}catch{}
    out = stripPriceAndSpaces(out);
    out = enforceKiyaku(out);
    if (countJa(out)>opts.max) out = hardCapJa(out, opts.max);
  }
  return out;
}
async function polish(apiKey:string, text:string, tone:string, style:string){
  const r = await openaiChat(apiKey, {
    model:"gpt-4o-mini", temperature:0, response_format:{type:"json_object"},
    messages:[
      { role:"system", content:'Return ONLY {"text": string}. (json)\n' + `以下を校正。幼稚な接続禁止。体言止め/「〜を実現」「〜を提供します」許容。トーン:${tone}\n${style}` },
      { role:"user", content: JSON.stringify({ current_text: text }) }
    ]
  });
  try{ return JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || text; }catch{ return text; }
}

/* ---------- Handler ---------- */
export const onRequestPost: PagesFunction = async (ctx) => {
  try {
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: "APIキー未設定" }), { status: 500 });

    const body = await ctx.request.json();
    const { text = "", tone = "上品・落ち着いた", minChars = 450, maxChars = 550 } = body || {};
    const STYLE = styleGuide(tone);

    let cleaned = stripPriceAndSpaces(String(text));
    cleaned = enforceKiyaku(cleaned);

    cleaned = await ensureLength(OPENAI_API_KEY, { draft: cleaned, min: minChars, max: maxChars, tone, style: STYLE });
    cleaned = await polish(OPENAI_API_KEY, cleaned, tone, STYLE);

    if (countJa(cleaned) > maxChars) cleaned = hardCapJa(cleaned, maxChars);
    cleaned = stripPriceAndSpaces(cleaned);
    cleaned = enforceKiyaku(cleaned);

    return new Response(JSON.stringify({ text: cleaned }), {
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), {
      status: 500,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
