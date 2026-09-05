import { NextRequest, NextResponse } from "next/server";

import Groq from "groq-sdk";

import {
  GoogleGenAI,
  type Content,
} from "@google/genai";

import {
  toolDeclarations,
  groqToolDeclarations,
  toolImplementations,
} from "@/lib/agent/tools";

import { supabaseAdmin } from "@/lib/supabase";

/* =========================================================
   MODELS
========================================================= */

const GROQ_MODEL = "openai/gpt-oss-20b";
const GEMINI_MODEL = "gemini-3.7-flash";

/* =========================================================
   SYSTEM PROMPT
========================================================= */

const SYSTEM_PROMPT = `
You are an AI commerce assistant for a merchant storefront.

Your job is to help customers discover products, compare them, recommend relevant products and accessories, and manage their cart.

IMPORTANT RULES:

1. PRODUCT SEARCH
- For any shopping recommendation, use searchProducts.
- If the customer asks for an EXACT processor (e.g. "an i5 laptop", "with Ryzen 5"), pass the processor parameter to searchProducts.
- If the customer asks for a MINIMUM/floor tier (e.g. "i5 or better", "minimum Ryzen 5", "at least i5"), pass processor_min instead — this returns that tier and anything stronger. Never use processor for these phrasings, since it would incorrectly exclude stronger options the customer would also accept.
- Never invent products, prices, specifications, stock, or availability.
- Only recommend products returned by the commerce tools.
- When an active campaign provides discounted_price, always quote discounted_price instead of the original price and mention the campaign discount.
- For a single product response, make the product name bold and include RAM, storage, battery, and price as bullet points when available.
- For comparisons or recommendations between multiple similar options, always call compareProducts first. Present the result as a Markdown table with products as columns and attributes as rows, followed by one concise sentence recommending the best fit and why, tied to the customer's stated budget or use case.

2. PRODUCT CONTEXT
- Remember products discussed earlier in the conversation.
- If the user says "it", "that laptop", "this product", "the one you recommended", etc., resolve it using the conversation history.
- Do not unnecessarily ask the user to repeat a product that is already clearly known.

3. UPSELLS
- Call suggestUpsells in these cases only:
  (a) The user explicitly asks for accessories, complementary products, or "what goes well with it" — for the most recently discussed/recommended product.
  (b) You are recommending a single product for the FIRST time in this conversation (e.g. the user just described a need and you picked one product to recommend). Call suggestUpsells once for that product.
  (c) Immediately after a successful addToCart call, call suggestUpsells for the product that was just added, and offer ONE relevant suggestion alongside the cart confirmation (e.g. "ProBook 14 added to your cart. A Wireless Mouse M2 (₹899) pairs well with it — want me to add that too?"). Keep this brief — confirmation first, one suggestion after, not a full pitch.
- Do NOT call suggestUpsells if:
  - The user is asking a general question (price, specs, availability, cart status, checkout, etc.) that isn't a fresh product recommendation and isn't a cart addition.
  - You already suggested upsells for this exact product earlier in the conversation — do not repeat it, including after a repeat addToCart for the same product (e.g. increasing quantity).
  - You are answering a follow-up about a product already recommended (e.g. "what's its battery life", "is it in stock") rather than newly recommending it or adding it to cart.
  - The response is a comparison table between multiple products (upsells apply to a single chosen product, not a comparison — only offer them if the user then picks one or adds one to cart).
- Recommend only products returned by suggestUpsells.

4. CART
- Adding an item to the cart is a money-related commerce action.
- The user must explicitly authorize the addition.
- If the user asks a question such as:
  "Should I add it?"
  "Can I add it?"
  "What happens if I add it?"
  do NOT add it.

- If the user explicitly says:
  "Add it to my cart"
  "Add the ProBook 14 to my cart"
  "Yes, add it"
  "Add one"
  "Put it in my cart"
  or gives any similarly clear authorization,
  IMMEDIATELY call addToCart with just product_id and quantity.

- The session_id is automatically supplied by the server on every tool call — it is NEVER something you need to ask the user for, mention, or include yourself. You do not have access to it and do not need it. NEVER ask the user for a "session ID" or any similar identifier under any circumstance.
- DO NOT ask for confirmation again after explicit authorization.
- DO NOT merely say that the product is ready to be added.
- DO NOT ask the user for any information before calling addToCart other than which product and quantity, if not already clear from context.
- Actually call addToCart immediately once the product and authorization are clear.
- Only add products that exist in the catalog.

5. CART TOTAL
- When the user asks about their cart, use getCart.
- Never calculate or invent cart totals yourself when getCart can provide the exact total.

6. PAYMENT
- Do not claim that payment has been completed.
- Do not invent Razorpay order IDs or payment IDs.
- Checkout and payment are handled separately by the application.

7. RESPONSE STYLE
- Be concise and natural.
- Return Markdown directly for product details, bullet lists, and comparison tables.
- Do not use filler phrases such as "Great question!" or "I'd be happy to help".
- Prices must be shown in INR using ₹.
`;

type ActiveCampaign = {
  name: string;
  discount_percent: number;
  active_category: string;
};

function buildSystemPrompt(campaign: ActiveCampaign | null) {
  if (!campaign) return SYSTEM_PROMPT;

  return `${SYSTEM_PROMPT}

CURRENT MERCHANT CAMPAIGN:
- ${campaign.name}: ${campaign.discount_percent}% off ${campaign.active_category} products.
- Mention this discount when recommending products that match the campaign category.
- When discussing the cart, use the getCart result as the source of truth for campaign-adjusted totals. Do not calculate or invent totals in the response.`;
}

/* =========================================================
   TYPES
========================================================= */

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/* =========================================================
   HISTORY SANITIZATION
========================================================= */

function sanitizeHistory(
  history: unknown
): HistoryMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item: any) =>
        (item?.role === "user" ||
          item?.role === "assistant" ||
          item?.role === "model") &&
        typeof item?.content === "string"
    )
    .map((item: any) => ({
      role:
        item.role === "model"
          ? "assistant"
          : item.role,
      content: item.content,
    }))
    .slice(-20);
}

/* =========================================================
   AUDIT LOG
========================================================= */

async function logAudit(
  sessionId: string,
  action: string,
  description: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      session_id: sessionId,
      action,
      description,
      metadata,
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

/* =========================================================
   GROQ AGENT
========================================================= */

async function runGroqAgent(
  message: string,
  history: HistoryMessage[],
  sessionId: string,
  systemPrompt: string
): Promise<{
  reply: string;
  toolRounds: number;
  toolResults: unknown[];
}> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const groq = new Groq({
    apiKey,
  });

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt,
    },

    ...history,

    {
      role: "user",
      content: message,
    },
  ];

  /*
   * IMPORTANT:
   * These are Groq/OpenAI-compatible tool declarations.
   * Do NOT use Gemini's toolDeclarations here.
   */
  const tools = groqToolDeclarations;

  let toolRounds = 0;
  const toolResults: unknown[] = [];

  const MAX_TOOL_ROUNDS = 5;

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const completion =
      await groq.chat.completions.create({
        model: GROQ_MODEL,

        messages,

        tools,

        tool_choice: "auto",

        parallel_tool_calls: false,

        max_completion_tokens: 1200,
      });

    const assistantMessage =
      completion.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error(
        "Groq returned an empty response."
      );
    }

    messages.push(assistantMessage);

    const toolCalls =
      assistantMessage.tool_calls;

    /*
     * No tools required.
     * Groq has generated the final answer.
     */
    if (
      !toolCalls ||
      toolCalls.length === 0
    ) {
      return {
        reply:
          assistantMessage.content ||
          "I could not generate a response. Please try again.",
        toolRounds,
        toolResults,
      };
    }

    toolRounds++;

    for (const toolCall of toolCalls) {
      const toolName =
        toolCall.function?.name;

      if (!toolName) {
        continue;
      }

      const tool =
        toolImplementations[toolName];

      /*
       * Unknown tool
       */
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: `Unknown tool: ${toolName}`,
          }),
        });

        continue;
      }

      /*
       * Parse tool arguments
       */
      let args: Record<string, any> = {};

      try {
        args = JSON.parse(
          toolCall.function?.arguments || "{}"
        );
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: "Invalid tool arguments.",
          }),
        });

        continue;
      }

      /*
       * Always force server-controlled session ID.
        toolResults.push(result);
       * The model cannot choose another user's session.
       */
      const toolArgs = {
        session_id: sessionId,
        ...args,
      };

      /*
       * Re-enforce session ID after spreading args.
       */
      toolArgs.session_id = sessionId;

      try {
        console.log(
          `[GROQ TOOL] ${toolName}`,
          toolArgs
        );

        const result =
          await tool(toolArgs);

        await logAudit(
          sessionId,
          toolName,
          `AI executed ${toolName}`,
          {
            provider: "groq",
            args: toolArgs,
            result,
          }
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        const errorMessage =
          error?.message ||
          "Tool execution failed.";

        console.error(
          `[GROQ TOOL ERROR] ${toolName}`,
          errorMessage
        );

        await logAudit(
          sessionId,
          `${toolName}_error`,
          `AI tool failed: ${toolName}`,
          {
            provider: "groq",
            args: toolArgs,
            error: errorMessage,
          }
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: errorMessage,
          }),
        });
      }
    }
  }

  throw new Error(
    "Maximum AI tool rounds reached."
  );
}

/* =========================================================
   GEMINI FALLBACK
========================================================= */

async function runGeminiAgent(
  message: string,
  history: HistoryMessage[],
  sessionId: string,
  systemPrompt: string
): Promise<{
  reply: string;
  toolRounds: number;
  toolResults: unknown[];
}> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const contents: Content[] = [
    ...history.map((item) => ({
      role:
        item.role === "assistant"
          ? ("model" as const)
          : ("user" as const),

      parts: [
        {
          text: item.content,
        },
      ],
    })),

    {
      role: "user",
      parts: [
        {
          text: message,
        },
      ],
    },
  ];

  const config = {
    systemInstruction: systemPrompt,

    tools: [
      {
        functionDeclarations:
          toolDeclarations,
      },
    ],
  };

let response = await ai.models.generateContent({
  model: GEMINI_MODEL,
  contents: contents as any,
  config: config as any,
});

  let toolRounds = 0;
  const toolResults: unknown[] = [];

  const MAX_TOOL_ROUNDS = 5;

  while (
    response.functionCalls &&
    response.functionCalls.length > 0 &&
    toolRounds < MAX_TOOL_ROUNDS
  ) {
    toolRounds++;

    const assistantContent =
      response.candidates?.[0]?.content;

    if (assistantContent) {
      contents.push(assistantContent);
    }

    const functionResponseParts: Content["parts"] =
      [];

    for (const call of response.functionCalls) {
      const toolName = call.name;

      if (!toolName) {
        continue;
      }

      const tool =
        toolImplementations[toolName];

      /*
       * Unknown tool
       */
      if (!tool) {
        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            id: call.id,
            response: {
              error: `Unknown tool: ${toolName}`,
            },
          },
        });

        continue;
      }

      /*
       * Server controls session ID
       */
      const args = {
        session_id: sessionId,
        ...(call.args ?? {}),
      };

      args.session_id = sessionId;

      try {
        console.log(
          `[GEMINI TOOL] ${toolName}`,
          args
        );

        const result =
          await tool(args);
        toolResults.push(result);

        await logAudit(
          sessionId,
          toolName,
          `AI executed ${toolName}`,
          {
            provider: "gemini",
            args,
            result,
          }
        );

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            id: call.id,
            response: {
              result,
            },
          },
        });
      } catch (error: any) {
        const errorMessage =
          error?.message ||
          "Tool execution failed.";

        console.error(
          `[GEMINI TOOL ERROR] ${toolName}`,
          errorMessage
        );

        await logAudit(
          sessionId,
          `${toolName}_error`,
          `AI tool failed: ${toolName}`,
          {
            provider: "gemini",
            args,
            error: errorMessage,
          }
        );

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            id: call.id,
            response: {
              error: errorMessage,
            },
          },
        });
      }
    }

    if (functionResponseParts.length > 0) {
      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: contents as any,
        config: config as any,
      });
  }

  return {
    reply:
      response.text ||
      "I could not generate a response. Please try again.",

    toolRounds,
       toolResults,
  };
}

/* =========================================================
   MAIN POST API
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    /*
     * Create or reuse shopping session.
     */
    const sessionId =
      typeof body.session_id === "string" &&
      body.session_id.trim()
        ? body.session_id.trim()
        : crypto.randomUUID();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          error: "Message is required.",
        },
        {
          status: 400,
        }
      );
    }

    const history = sanitizeHistory(
      body.history
    );

    const { data: activeCampaign } = await supabaseAdmin
      .from("campaigns")
      .select("name,discount_percent,active_category")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const systemPrompt = buildSystemPrompt(activeCampaign as ActiveCampaign | null);

    let result: {
      reply: string;
      toolRounds: number;
      toolResults: unknown[];
    };

    /* =====================================================
       PRIMARY: GROQ
    ===================================================== */

    try {
      console.log("[AI] Trying Groq...");

      result = await runGroqAgent(
        message,
        history,
        sessionId,
        systemPrompt
      );

      console.log("[AI] Groq succeeded.");

      await logAudit(
        sessionId,
        "ai_provider",
        "Groq handled the request",
        {
          provider: "groq",
          model: GROQ_MODEL,
        }
      );
    } catch (groqError: any) {
      console.error(
        "[AI] Groq failed:",
        groqError?.message
      );

      await logAudit(
        sessionId,
        "groq_fallback",
        "Groq failed, switching to Gemini",
        {
          error:
            groqError?.message ||
            "Unknown Groq error",
        }
      );

      /* ===================================================
         FALLBACK: GEMINI
      =================================================== */

      try {
        console.log(
          "[AI] Trying Gemini fallback..."
        );

        result = await runGeminiAgent(
          message,
          history,
          sessionId,
          systemPrompt
        );

        console.log(
          "[AI] Gemini fallback succeeded."
        );

        await logAudit(
          sessionId,
          "ai_provider",
          "Gemini handled the request as fallback",
          {
            provider: "gemini",
            model: GEMINI_MODEL,
          }
        );
      } catch (geminiError: any) {
        console.error(
          "[AI] Gemini fallback failed:",
          geminiError?.message
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "The AI service is temporarily busy. Please try again in a moment.",
          },
          {
            status: 503,
          }
        );
      }
    }

    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    await logAudit(
      sessionId,
      "assistant_response",
      "AI generated customer response",
      {
        tool_rounds: result.toolRounds,
      }
    );

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      reply: result.reply,
      tool_rounds: result.toolRounds,
      tool_results: result.toolResults,
    });
  } catch (error: any) {
    console.error(
      "[AGENT API ERROR]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Something went wrong. Please try again.",
      },
      {
        status: 500,
      }
    );
  }
}