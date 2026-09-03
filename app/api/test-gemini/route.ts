import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_API_KEY is missing',
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: 'Reply with exactly: GEMINI_OK',
    });

    return NextResponse.json({
      success: true,
      response: response.text,
    });
  } catch (error: any) {
    console.error('Gemini test error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown Gemini error',
      },
      { status: 500 }
    );
  }
}