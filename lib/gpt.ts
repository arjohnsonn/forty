import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Initialize OpenAI provider (strict compatibility for official API)
const openai = createOpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_KEY,
  compatibility: "strict",
});

/**
 * Generates a text response with configurable model and provider options.
 * @param prompt - The user query or instruction.
 * @param config.modelId - OpenAI model ID (default: 'gpt-4o-mini').
 * @param config.providerOptions - Additional OpenAI-specific settings.
 * @returns The generated text.
 */
export async function getGPTResponse(
  prompt: string,
  config?: { modelId?: string; providerOptions?: Record<string, any> }
): Promise<string> {
  const modelId = config?.modelId || "gpt-4o-mini";
  const { text } = await generateText({
    model: openai.chat(modelId),
    prompt,
    providerOptions: config?.providerOptions
      ? { openai: config.providerOptions }
      : undefined,
  });
  return text;
}
