import { GoogleGenAI } from "@google/genai";
import { env } from "../config";

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

class LLMService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
    });
  }

  //   async generate(systemPrompt: string, userPrompt: string) {
  //     const response = await this.ai.models.generateContent({
  //       model: "gemini-flash-latest",
  //       contents: userPrompt,
  //       config: {
  //         systemInstruction: systemPrompt,
  //       },
  //     });

  //     return response.text ?? "";
  // }

  async generate(request: GenerateRequest) {
    const response = await this.ai.models.generateContent({
      model: request.model ?? "gemini-flash-latest",
      contents: request.userPrompt,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0,
      },
    });
    return response.text ?? "";
  }
  async generateJson<T>(request: GenerateRequest): Promise<T> {
    const text = await this.generate(request);

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned) as T;
  }
}

export const llmService = new LLMService();
