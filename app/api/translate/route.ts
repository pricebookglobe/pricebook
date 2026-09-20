import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function POST(req: NextRequest) {
  const { targetLanguage, strings } = await req.json();

  if (!targetLanguage || !Array.isArray(strings) || strings.length === 0) {
    return NextResponse.json({ error: "targetLanguage and a non-empty strings array are required" }, { status: 400 });
  }

  try {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content:
            `Translate each of these UI strings from English into ${targetLanguage}, for a grocery price-comparison app. ` +
            "Keep the tone short and plain, matching a real app's UI (not literal/academic translation). " +
            "Preserve any punctuation like … or — where natural. " +
            'Return ONLY a JSON object shaped {"translations": {"<original English string>": "<translation>", ...}} ' +
            "with exactly one entry per input string, using the input string verbatim as the key. No prose, no markdown.\n\n" +
            JSON.stringify(strings)
        }
      ],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    return NextResponse.json({ translations: parsed.translations ?? {} });
  } catch (err) {
    console.error("translate error", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
