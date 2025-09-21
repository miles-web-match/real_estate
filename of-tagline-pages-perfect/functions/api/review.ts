export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

/* ====== Utils / ここから describe.ts と同一のユーティリティ群 ====== */
function countJa(s: string) { return Array.from(s || "").length; }
function hardCapJa(s: string, max: number) {
  const arr = Array.from(s || ""); if (arr.length <= max) return s;
  const upto = arr.slice(0, max), enders = new Set(["。","！","？","."]);
  let cut = -1; for (let i = upto.length-1; i>=0; i--) if (enders.has(upto[i])) { cut=i+1; break; }
  return upto.slice(0, cut > 0 ? cut : max).join("").trim();
}
const stripPriceAndSpaces = (s: string) =>
  s.replace(/(価格|金額|[一二三四五六七八九十百千万億兆\d０-９,，\.]+(?:億|万)?円)/g,"").replace(/\s{2,}/g," ").trim();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripWords = (s: string, words: string[]) => s.replace(new RegExp(`(${words.map(esc).join("|")})`, "g"), "");
const BANNED_HARD = ["完全","完ぺき","絶対","万全","100％","理想","日本一","日本初","業界一","No.1","一流","最高","最高級","最上級","極上","地域でナンバーワン","抜群","特選","厳選","正統","至近","至便","特安","激安","掘出","破格","投売り","バーゲンセール"];
const SOFT_MAP: Array<[RegExp, string]> = [
  [/日当たり(良好|抜群)/g,"日当たりに配慮"],
  [/通風(良好|抜群)/g,"通風に配慮"],
  [/眺望(良好|抜群)/g,"眺望に配慮"],
  [/静寂/g,"静けさに配慮"],
  [/閑静/g,"落ち着きのある環境を目指す計画"],
  [/騒音なし/g,"騒音対策に配慮"],
  [/抜群の利便性/g,"利便性に配慮"],
  [/利便性(が高い|最高)/g,"利便性に配慮"],
  [/アクセス(至便|抜群)/g,"アクセスしやすい立地"],
  [/(日本一|業界一|No\.?1|トップクラス)/g,"適切な水準"],
  [/(必ず|間違いなく|保証|万全)/g,"配慮されています"],
];
function softenPhrases(t: string){ let o=t; for(const[re,rep] of SOFT_MAP) o=o.replace(re,rep); return o; }
function widenWalkingMinutes(text: string){
  return text.replace(/徒歩(\d{1,2})分(?![~〜]\d)/g, (_m,p1)=>{ const base=Number(p1); if(!Number.isFinite(base)) return _m; return `徒歩${base}~${base+2}分`; });
}
function stripFloorPlan(text: string){
  const fp = ["ワンルーム","ワン ルーム","スタジオタイプ","スタジオ タイプ","メゾネット","ロフト","間取り","間取","間口","LDK","SLDK","SDK","LK","DK","K","1LDK","2LDK","3LDK","4LDK","5LDK","1DK","2DK","3DK","4DK","1K","2K","3K","4K","１ＬＤＫ","２ＬＤＫ","３ＬＤＫ","４ＬＤＫ","１ＤＫ","２ＤＫ","３ＤＫ","４ＤＫ","１Ｋ","２Ｋ","３Ｋ","４Ｋ","\\d\\s*(LDK|DK|K)","[０-９]\\s*(ＬＤＫ|ＤＫ|Ｋ)"];
  return text.replace(new RegExp(fp.join("|"),"gi"),"");
}
function enforceKiyaku(text: string){
  let out=text;
  out = stripWords(out, BANNED_HARD);
  out = out.replace(/新築/g,"");
  out = stripFloorPlan(out);
  out = widenWalkingMinutes(out);
  out = softenPhrases(out);
  return out.replace(/\s{2,}/g," ").trim();
}
function styleGuide(tone: string){
  if(tone==="親しみやすい") return [
    "文体: やわらかい丁寧語。親近感を大切にし、専門用語は避ける。",
    "文長: 30〜60字中心。文末は基本「です」「ます」。",
    "禁止: 子どもっぽい接続（〜で、〜だから〜です）。過度な誇張。"
  ].join("\n");
  if(tone==="一般的") return [
    "文体: 中立・説明的。事実ベースで過不足なく、読みやすさ重視。",
    "文長: 40〜70字中心。文末は基本「です」「ます」。",
    "禁止: 子どもっぽい接続（〜で、〜だから〜です）。曖昧な断定。"
  ].join("\n");
  return [
    "文体: 上品・端正・落ち着いた調子。余白と品位を感じる表現。",
    "文長: 40〜70字中心。体言止めは1〜2文まで許容。",
    "禁止: 子どもっぽい接続（〜で、〜だから〜です）。誇張的最上級。"
  ].join("\n");
}
async function openaiChat(apiKey: string, payload: any){
  const r = await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${apiKey}`},body:JSON.stringify(payload)});
  if(!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`); return r.json();
}
async function ensureLengthDescribe(apiKey: string, opts:{draft:string;context:string;min:number;max:number;tone:string;style:string}){
  let out = opts.draft || "";
  for(let i=0;i<3;i++){
    const len=countJa(out); if(len>=opts.min && len<=opts.max) return out;
    const need=len<opts.min?"expand":"condense";
    const r=await openaiChat(apiKey,{model:"gpt-4o-mini",temperature:0.1,response_format:{type:"json_object"},messages:[
      {role:"system",content:'Return ONLY {"text": string}. (json)\n'+`日本語・トーン:${opts.tone}\n${opts.style}\n`+`目的: ${opts.min}〜${opts.max}（全角）に${need==="expand"?"増やす":"収める"}。幼稚な接続は不可。価格/金額/URL/電話は不可。`},
      {role:"user",content:JSON.stringify({current_text:out,extracted_text:opts.context,action:need})}
    ]});
    try{ out=String(JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text||out);}catch{}
    out=stripPriceAndSpaces(out); out=enforceKiyaku(out); if(countJa(out)>opts.max) out=hardCapJa(out,opts.max);
  }
  return out;
}
async function polishJapanese(apiKey:string, text:string, tone:string, style:string){
  const r=await openaiChat(apiKey,{model:"gpt-4o-mini",temperature:0,response_format:{type:"json_object"},messages:[
    {role:"system",content:'Return ONLY {"text": string}. (json)\n' + `以下を校正。幼稚な接続を避ける。トーン:${tone}\n${style}\n文末は原則「です」「ます」だが、体言止め/「〜を実現」「〜を提供します」も許容。`},
    {role:"user",content:JSON.stringify({current_text:text})}
  ]});
  try{ return JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || text;}catch{ return text; }
}
async function beautifyByTone(apiKey:string, text:string, tone:string){
  let systemPrompt="";
  if(tone.includes("上品")){
    systemPrompt='Return ONLY {"text": string}. (json)\n'+"目標: 高級不動産広告コピーのように、自然で美しい日本語。文体は上品・端正。体言止めも可。誇張・幼稚な接続は禁止。";
  } else if (tone.includes("一般")){
    systemPrompt='Return ONLY {"text": string}. (json)\n'+"目標: 中立・説明的で読みやすい文章。誇張禁止。体言止めは控えめ。";
  } else {
    systemPrompt='Return ONLY {"text": string}. (json)\n'+"目標: 親しみやすくやわらかい文章。暮らしの情景が浮かぶように。誇張・幼稚な接続は禁止。";
  }
  const r=await openaiChat(apiKey,{model:"gpt-4o-mini",temperature:0.3,response_format:{type:"json_object"},messages:[
    {role:"system",content:systemPrompt},{role:"user",content:JSON.stringify({current_text:text,tone})}
  ]});
  try{ return JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || text;}catch{ return text; }
}
async function applyRevisionNotes(apiKey:string, text:string, notes:string[]|string, tone:string, style:string){
  const list = Array.isArray(notes)? notes.filter(Boolean): String(notes||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(!list.length) return text;
  const r=await openaiChat(apiKey,{model:"gpt-4o-mini",temperature:0.2,response_format:{type:"json_object"},messages:[
    {role:"system",content:'Return ONLY {"text": string}. (json)\n修正要望を反映。誇張禁止・規約配慮・間取り不可・幼稚な接続不可。'},
    {role:"user",content:JSON.stringify({current_text:text,revision_notes:list,tone,style})}
  ]});
  try{ return JSON.parse(r.choices?.[0]?.message?.content||"{}")?.text || text;}catch{ return text; }
}
/* ====== Utils ここまで ====== */

export const onRequestPost: PagesFunction = async (ctx) => {
  try{
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if(!OPENAI_API_KEY) return new Response(JSON.stringify({error:"OPENAI_API_KEY is not set"}),{status:500});

    const { text="", tone="上品・落ち着いた", minChars=450, maxChars=550, referenceExamples=[], revisionNotes=[] } = await ctx.request.json();

    const STYLE = styleGuide(tone);

    // 任意：例文からスタイル抽出
    let anchors = "";
    if (Array.isArray(referenceExamples) && referenceExamples.length){
      const r0 = await openaiChat(OPENAI_API_KEY,{model:"gpt-4o-mini",temperature:0,response_format:{type:"json_object"},messages:[
        {role:"system",content:'Return ONLY {"rules": string}. 日本語。例文の共通スタイル（言い回し/語彙/接続/文長）を要約。'},
        {role:"user",content:JSON.stringify({examples:referenceExamples.slice(0,5)})}
      ]});
      try{ anchors = JSON.parse(r0.choices?.[0]?.message?.content||"{}")?.rules || ""; }catch{}
    }

    // 初期クリーニング
    let checked = stripPriceAndSpaces(String(text));
    checked = enforceKiyaku(checked);

    // 長さ調整・校正・仕上げ
    checked = await ensureLengthDescribe(OPENAI_API_KEY,{draft:checked,context:"",min:minChars,max:maxChars,tone,style:STYLE+(anchors?`\n${anchors}`:"")});
    checked = await polishJapanese(OPENAI_API_KEY, checked, tone, STYLE+(anchors?`\n${anchors}`:""));
    checked = await beautifyByTone(OPENAI_API_KEY, checked, tone);
    checked = stripPriceAndSpaces(checked);
    checked = enforceKiyaku(checked);

    // 修正要望
    let finalText = await applyRevisionNotes(OPENAI_API_KEY, checked, revisionNotes, tone, STYLE+(anchors?`\n${anchors}`:""));
    finalText = stripPriceAndSpaces(finalText);
    finalText = enforceKiyaku(finalText);
    if(countJa(finalText)>maxChars) finalText = hardCapJa(finalText, maxChars);

    return new Response(JSON.stringify({ checked, final: finalText, text: finalText }), { headers: { "content-type":"application/json", "Access-Control-Allow-Origin":"*" }});
  }catch(e:any){
    return new Response(JSON.stringify({error:e?.message||"server error"}),{status:500,headers:{"content-type":"application/json","Access-Control-Allow-Origin":"*"}});
  }
};
