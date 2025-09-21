export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

// ここから review.ts と同じ Utils をそのままコピペ（省略せず貼るのが確実）
/* ……（上の review.ts の Utils をそのまま貼ってください） …… */

export const onRequestPost: PagesFunction = async (ctx) => {
  try{
    const OPENAI_API_KEY = (ctx.env as any)?.OPENAI_API_KEY as string;
    if(!OPENAI_API_KEY) return new Response(JSON.stringify({error:"OPENAI_API_KEY is not set"}),{status:500});

    const { text="", tone="上品・落ち着いた", minChars=450, maxChars=550, revisionNotes=[] } = await ctx.request.json();
    const STYLE = styleGuide(tone);

    let out = stripPriceAndSpaces(String(text));
    out = enforceKiyaku(out);

    out = await applyRevisionNotes(OPENAI_API_KEY, out, revisionNotes, tone, STYLE);
    out = stripPriceAndSpaces(out);
    out = enforceKiyaku(out);
    if(countJa(out)>maxChars) out = hardCapJa(out, maxChars);

    return new Response(JSON.stringify({ text: out }), { headers: { "content-type":"application/json","Access-Control-Allow-Origin":"*" }});
  }catch(e:any){
    return new Response(JSON.stringify({error:e?.message||"server error"}),{status:500,headers:{"content-type":"application/json","Access-Control-Allow-Origin":"*"}});
  }
};
