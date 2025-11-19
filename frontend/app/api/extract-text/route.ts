import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic to prevent build-time analysis
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    console.log("🔍 [API] Starting Text Extraction...");

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error("❌ [API] No file found in request");
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`📄 [API] Processing file: ${file.name} (${file.size} bytes, type: ${file.type})`);

    // Validate file size (prevent memory issues)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      console.error(`❌ [API] File too large: ${file.size} bytes (max: ${MAX_FILE_SIZE})`);
      return NextResponse.json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
    }

    if (file.size === 0) {
      console.error("❌ [API] File is empty");
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Convert File to Buffer
    console.log("📦 [API] Converting file to buffer...");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = '';

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      console.log("📑 [API] Processing PDF file...");
      
      try {
        // Use require inside function to avoid build-time evaluation
        // This prevents browser API dependencies from being loaded during build
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse');
        
        // Handle potentially different export formats (CJS vs ESM interop)
        const parseFunc = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
        
        if (typeof parseFunc !== 'function') {
           throw new Error(`pdf-parse export is not a function (got ${typeof pdfParse})`);
        }
        
        console.log("🔧 [API] Calling pdf-parse...");
        const data = await parseFunc(buffer);
        
        if (!data || !data.text) {
          console.error("❌ [API] pdf-parse returned empty or invalid data");
          return NextResponse.json({ error: 'PDF parsing returned no text. The PDF may be corrupted or image-only.' }, { status: 500 });
        }
        
        text = data.text;
        console.log(`✅ [API] Extraction Success! Length: ${text.length} chars`);
      } catch (pdfError: any) {
        console.error("❌ [API] PDF parsing error:", pdfError);
        
        // Provide more specific error messages
        if (pdfError.message?.includes('Invalid PDF')) {
          return NextResponse.json({ error: 'Invalid PDF file. The file may be corrupted or not a valid PDF.' }, { status: 400 });
        }
        if (pdfError.message?.includes('password')) {
          return NextResponse.json({ error: 'PDF is password-protected. Please remove the password and try again.' }, { status: 400 });
        }
        
        return NextResponse.json({ 
          error: `PDF parsing failed: ${pdfError.message || 'Unknown error'}` 
        }, { status: 500 });
      }
    } else {
      // For now only PDF is strictly required by the prompt's example
      console.error(`❌ [API] Unsupported file type: ${file.type}`);
      return NextResponse.json({ 
        error: `Unsupported file type: ${file.type || 'unknown'}. Only PDF files are supported for context injection.` 
      }, { status: 400 });
    }

    // Clean up text (remove excessive whitespace)
    text = text.replace(/\n+/g, '\n').trim();

    if (!text || text.length === 0) {
      console.error("❌ [API] Extracted text is empty after processing");
      return NextResponse.json({ 
        error: 'No text could be extracted from the PDF. The file may be image-only or corrupted.' 
      }, { status: 500 });
    }

    console.log(`✅ [API] Text extraction complete. Final length: ${text.length} chars`);
    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("❌ [API] Extraction Error:", error);
    console.error("❌ [API] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return NextResponse.json({ 
      error: error.message || 'Extraction failed. Please check the file and try again.' 
    }, { status: 500 });
  }
}

