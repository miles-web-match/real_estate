// ==== Cloudflare Pages Functions: POST /api/describe ====
// 必要環境変数: OPENAI_API_KEY

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

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
// 強い優良誤認や最上級は削除。静寂/利便性などは“柔らかく言い換え”。
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

/** 徒歩X分 → 徒歩X~(X+2)分（既に幅表記があるものはスキップ） */
function widenWalkingMinutes(text: string) {
  return text.replace(/徒歩(\d{1,2})分(?![~〜]\d)/g, (_m, p1) => {
    const base = Number(p1);
    if (!Number.isFinite(base)) return _m;
    return `徒歩${base}~${base + 2}分`;
  });
}

/** 間取りは言わない（略号/表記の網羅的除去） */
function stripFloorPlan(text: string) {
  const fp = [
    "ワンルーム","ワン ルーム","スタジオタイプ","スタジオ タイプ","メゾネット","ロフト",
    "間取り","間取","間口",
    "LDK","SLDK","SDK","LK","DK","K",
    "1LDK","2LDK","3LDK","4LDK","5LDK","1DK","2DK","3DK","4DK","1K","2K","3K","4K",
    "１ＬＤＫ","２ＬＤＫ","３ＬＤＫ","４ＬＤＫ","１ＤＫ","２ＤＫ","３ＤＫ","４ＤＫ","１Ｋ","２Ｋ","３Ｋ","４Ｋ",
    "\\d\\s*(LDK|DK|K)","[０-９]\\s*(ＬＤＫ|ＤＫ|Ｋ)"
  ];
  return text.replace(new RegExp(fp.join("|"), "gi"), "");
}

/** ★ 1室向け情報を落とす（マンション“1棟”紹介限定） */
function stripUnitSpecific(text: string) {
  const patterns: RegExp[] = [
    // 号室・所在階・方角
    /\b\d{1,4}\s*号室\b/g,
    /(所在|当該)?\s*([地上\d]+)階部分/g,
    /(方位|方角|向き)\s*[:：]?\s*(南|東|西|北|南東|南西|北東|北西|東南|西南|東北|西北)/g,

    // 間取り・専有系
    /\b(間取り|間取|専有面積|内法面積|バルコニー面積|ルーフバルコニー面積|テラス面積)\b[^\n。]*?/g,
    /\b(\d+\s*(?:LDK|DK|K))\b/g,
    /[０-９]+\s*(ＬＤＫ|ＤＫ|Ｋ)/g,
    /\b(1LDK|2LDK|3LDK|4LDK|5LDK|1DK|2DK|3DK|4DK|1K|2K|3K|4K)\b/gi,
    /\b(ワンルーム|スタジオタイプ|メゾネット|ロフト)\b/g,

    // 室内仕様・個別改装
    /\b(室内|居室|専有部)[:：]?[^\n。]*?(新規|交換|設置|張替|貼替|取替|取換|清掃|補修|クリーニング)[^\n。]*?[。]/g,
    /\b(リフォーム|リノベーション|改装|改修|内装)\b[^\n。]*?[。]/g,
    /\b(フローリング|クロス|建具|サッシ|キッチン|浴室|トイレ|洗面|給湯器|食洗機|浄水器|浴室乾燥機)\b[^\n。]*?(新規|交換|取替)/g,

    // 価格・費用・販売行為
    /\b(価格|税込|消費税|管理費|修繕積立金|ローン|返済|頭金|ボーナス払い|内覧|オープンルーム|申込|引渡|引き渡し)\b[^\n。]*?[。]/g,

    // 専有サイズの m2/㎡ の裸数値
    /\b\d{1,3}(\.\d+)?\s*(m2|㎡)\b/g,

    // ★ 追加：令和/平成 × リフォーム等（時期付き専有改装）
    /(令和|平成)\s*\d+年\s*\d+月[^\n。]*(リフォーム|リノベ|改装|改修|内装|交換|新規)/g,

    // ★ 追加：バルコニーの向き（南向き 等）
    /(バルコニー|テラス)[^\n。]{0,12}(南|東|西|北|南東|南西|北東|北西)向き/g,

    // ★ 追加：駐車場の空き・在庫表現
    /駐車場[^\n。]*?(空き|空有|空無|募集中|残り\d+台|(?:[0-9０-９]+)台)/g,

    // ★ 追加：勧誘・募集系の文言
    /(ぜひ.*ください|お問い合わせ|内覧|見学|オープンルーム|ご案内)/g,
  ];
  let out = text;
  for (const re of patterns) out = out.replace(re, "");
  out = out.replace(/【?室内[^\n】]*】?/g, ""); // 囲み残骸の掃除
  return out.replace(/\s{2,}/g, " ").replace(/。\s*。/g, "。").trim();
}

/** フレーズ緩和 */
function softenPhrases(text: string) {
  let out = text;
  for (const [re, rep] of SOFT_MAP) out = out.replace(re, rep);
  return out;
}

/** 規約準拠クリーニング（1室情報→除去 / 間取り禁止 / 徒歩幅 / 緩和） */
function enforceKiyaku(text: string) {
  let out = text;

  // ★ 最初に「1室専用」情報を落とす（棟スコープへ統一）
  out = stripUnitSpecific(out);

  // 強い禁止語は削除
  out = stripWords(out, BANNED_HARD);

  // “新築”断定は避ける（根拠不明の場合は削除）
  out = out.replace(/新築/g, "");

  // 念のため：間取り語を削除
  out = stripFloorPlan(out);

  // 徒歩表現は幅を持たせる
  out = widenWalkingMinutes(out);

  // 言い切りの緩和
  out = softenPhrases(out);

  // 仕上げ
  return out.replace(/\s{2,}/g, " ").trim();
}

/* ---------- トーン/スタイル（ベース） ---------- */
function styleGuide(tone: string): string {
  if (tone === "親しみやすい") {
    return [
      "文体: やわらかい丁寧語。親近感を大切にし、専門用語は避ける。",
      "文長: 30〜60字中心。文末は基本「です」「ます」。",
      "禁止: 子どもっぽい接続（〜で、〜だから〜です）。過度な誇張。",
    ].join("\n");
  }
  if (tone === "一般的") {
    return [
      "文体: 中立・説明的。事実ベースで過不足なく、読みやすさ重視。",
      "文長: 40〜70字中心。文末は基本「です」「ます」。",
      "禁止: 子どもっぽい接続（〜で、〜だから〜です）。曖昧な断定。",
    ].join("\n");
  }
  // 上品・落ち着いた（高級コピー調の土台）
  return [
    "文体: 上品・端正・落ち着いた調子。余白と品位を感じる表現。",
    "文長: 40〜70字中心。体言止めは1〜2文まで許容。",
    "禁止: 子どもっぽい接続（〜で、〜だから〜です）。誇張的最上級。",
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

/* ---------- 長さ矯正 / 校正 / 最終整形 ---------- */
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
            "事実不足は一般的な叙述で補完。価格/金額/円/万円・電話番号・URLは禁止。幼稚な接続は禁止。",
        },
        { role: "user", content: JSON.stringify({ current_text: out, extracted_text: opts.context, action: need }) },
      ],
    });
    try {
      out = String(JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || out);
    } catch {}
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
      {
        role: "system",
        content:
          'Return ONLY {"text": string}. (json)\n' +
          `以下の日本語を校正。幼稚な接続（「〜で、〜だから〜です」）は避ける。トーン:${tone}\n${style}\n` +
          "文末は原則「です」「ます」だが、必要に応じて体言止めや「〜を実現」「〜を提供します」も許容。",
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

/** 最終整形（トーン別） */
async function beautifyByTone(apiKey: string, text: string, tone: string) {
  let systemPrompt = '';
  if (tone.includes("上品")) {
    // 高級コピー調
    systemPrompt =
      'Return ONLY {"text": string}. (json)\n' +
      "目標: 高級不動産広告コピーのように、自然で美しい日本語へ整える。\n" +
      "文体: 上品・端正・落ち着いた調子。読み手に安心感と格式を与える。\n" +
      "文末: 原則「です」「ます」。体言止めや「〜を実現」「〜を提供します」も許容。\n" +
      "禁止: 幼稚な接続（例:「〜で、〜だから〜です」）。誇張的な最上級・曖昧な断定は禁止。\n" +
      "語彙例: 「〜という全体コンセプトのもと」「〜に相応しい」「〜を実現」「〜を提供します」「〜が広がります」。";
  } else if (tone.includes("一般")) {
    // 中価格帯の中立・説明調
    systemPrompt =
      'Return ONLY {"text": string}. (json)\n' +
      "目標: 中立・説明的で読みやすい文章。過不足なく要点を整理。\n" +
      "文体: 平易で癖のない丁寧語。箇条書き的でなく、自然な段落構成。\n" +
      "文末: 原則「です」「ます」。体言止めは多用しない。\n" +
      "禁止: 幼稚な接続（「〜で、〜だから〜です」）。誇張・断定は避ける。\n" +
      "指針: 数字・固有名詞・設備などの事実を適度に織り交ぜ、読み手の判断材料を明確にする。";
  } else {
    // 親しみやすい：やわらかくフレンドリー
    systemPrompt =
      'Return ONLY {"text": string}. (json)\n' +
      "目標: やわらかく親しみやすい文章。暮らしのイメージが湧くように。\n" +
      "文体: 丁寧語だが砕けすぎない。難語は避け、具体が伝わる表現。\n" +
      "文末: 基本「です」「ます」。体言止めは控えめに。\n" +
      "禁止: 幼稚な接続（「〜で、〜だから〜です」）や過度な誇張。\n" +
      "指針: 生活シーン（朝・帰宅・休日）のイメージを一つ入れるとよい。";
  }

  const r = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ current_text: text, tone }) },
    ],
  });
  try {
    return JSON.parse(r.choices?.[0]?.message?.content || "{}")?.text || text;
  } catch {
    return text;
  }
}

/** 修正要望（任意）を反映 */
async function applyRevisionNotes(apiKey: string, text: string, notes: string[] | string, tone: string, style: string) {
  const list = Array.isArray(notes) ? notes.filter(Boolean) : String(notes || "").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if (!list.length) return text;

  const r = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return ONLY {"text": string}. (json)\n' +
          "与えられた本文に修正要望を反映。誇張や最上級は避け、規約に配慮。室内/専有/個別改装・間取り・価格は書かない。幼稚な接続は避ける。",
      },
      {
        role: "user",
        content: JSON.stringify({
          current_text: text,
          revision_notes: list,
          tone,
          style,
          constraints: {
            scope: "building_only",
            no_floor_plan: true,
            avoid_exaggeration: true,
          },
        }),
      },
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
      revisionNotes = [] as string[] | string,
    } = body || {};

    if (!name || !url)
      return new Response(JSON.stringify({ error: "name / url は必須です" }), { status: 400 });

    // 対象ページから本文抽出（部屋ページでもOK）
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

    /* ---------- ① 初回生成（draft） ---------- */
    const system =
      'Return ONLY {"text": string}. (json)\n' +
      [
        "あなたは日本語の不動産コピーライターです。",
        "出力はマンション“1棟”の紹介文に限定。入力URLが部屋販売ページでも、室内・専有・個別改装・間取り・価格には触れない。",
        `トーン: ${tone}。次のスタイルガイドに従う。`,
        STYLE_GUIDE,
        STYLE_ANCHORS ? `\n---\n【Style Anchors】\n${STYLE_ANCHORS}\n---` : "",
        `文字数は【厳守】${minChars}〜${maxChars}（全角）。`,
        "事実ベース。価格/金額/円/万円・電話番号・外部URLは禁止。",
        "ビル名（name）は2回程度自然に含める。過度な連呼は禁止。",
        "誇張・最上級・比較優位の断定は禁止。状況依存の表現は“配慮/傾向”に言い換える。",
        "幼稚な接続（「〜で、〜だから〜です」）は避ける。",
        "間取り（例: 1LDK/2DK/1K/ワンルーム 等）は触れない。",
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

    let draft = "";
    try {
      draft = String(JSON.parse(r1.choices?.[0]?.message?.content || "{}")?.text || "");
    } catch {}

    draft = stripPriceAndSpaces(draft);
    draft = enforceKiyaku(draft);

    /* ---------- ② 自動校正チェック（checked） ---------- */
    let checked = await ensureLengthDescribe(OPENAI_API_KEY, {
      draft,
      context: extracted_text,
      min: minChars,
      max: maxChars,
      tone,
      style: STYLE_GUIDE + (STYLE_ANCHORS ? `\n${STYLE_ANCHORS}` : ""),
    });
    checked = await polishJapanese(
      OPENAI_API_KEY,
      checked,
      tone,
      STYLE_GUIDE + (STYLE_ANCHORS ? `\n${STYLE_ANCHORS}` : "")
    );
    checked = await beautifyByTone(OPENAI_API_KEY, checked, tone);
    checked = stripPriceAndSpaces(checked);
    checked = enforceKiyaku(checked);

    /* ---------- ③ 修正要望の反映（final） ---------- */
    let finalText = await applyRevisionNotes(OPENAI_API_KEY, checked, revisionNotes, tone, STYLE_GUIDE);
    finalText = stripPriceAndSpaces(finalText);
    finalText = enforceKiyaku(finalText);
    if (countJa(finalText) > maxChars) finalText = hardCapJa(finalText, maxChars);

    // 後方互換: text は最終版
    const result = {
      text: finalText,
      draft,     // 初回生成
      checked,   // 自動校正チェック後
      final: finalText, // 修正要望反映後
    };

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), {
      status: 500,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
