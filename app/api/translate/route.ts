import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Sending every UI string in one request risks the model's response
// getting truncated before it finishes the JSON object — which silently
// breaks JSON.parse() and fails the whole translation, leaving the app
// stuck showing English with no visible error. Batching keeps each
// request small enough to reliably complete, and means the dictionary
// can keep growing without this breaking again.
const BATCH_SIZE = 40;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const { targetLanguage, strings } = await req.json();

  if (!targetLanguage || !Array.isArray(strings) || strings.length === 0) {
    return NextResponse.json({ error: "targetLanguage and a non-empty strings array are required" }, { status: 400 });
  }

  try {
    const batches = chunk(strings, BATCH_SIZE);
    const results = await Promise.all(
      batches.map(async (batch) => {
        const response = await openai().chat.completions.create({
          model: "gpt-4o",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content:
                `Translate each of these UI strings from English into ${targetLanguage}, for a grocery price-comparison app. ` +
                "Keep the tone short and plain, matching a real app's UI (not literal/academic translation). " +
                "Preserve any punctuation like … or — where natural. " +
                'Return ONLY a JSON object shaped {"translations": {"<original English string>": "<translation>", ...}} ' +
                "with exactly one entry per input string, using the input string verbatim as the key. No prose, no markdown.\n\n" +
                JSON.stringify(batch)
            }
          ],
          response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
        return parsed.translations ?? {};
      })
    );

    const translations = Object.assign({}, ...results);
    return NextResponse.json({ translations });
  } catch (err) {
    console.error("translate error", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
