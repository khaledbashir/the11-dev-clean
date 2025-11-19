import { NextRequest, NextResponse } from 'next/server';

// pdf-parse is a CommonJS module - use require for Next.js API routes
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = '';

    if (file.type === 'application/pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else {
      // For now only PDF is strictly required by the prompt's example
      return NextResponse.json({ error: 'Unsupported file type. Only PDF is supported for context injection.' }, { status: 400 });
    }

    // Clean up text (remove excessive whitespace)
    text = text.replace(/\n+/g, '\n').trim();

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Error extracting text:', error);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}

