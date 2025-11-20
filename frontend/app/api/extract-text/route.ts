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

    // Check file type
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                   file.name.toLowerCase().endsWith('.docx');
    const isDoc = file.type === 'application/msword' || file.name.toLowerCase().endsWith('.doc');

    if (isPDF) {
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
        console.log(`✅ [API] PDF Extraction Success! Length: ${text.length} chars`);
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
    } else if (isDocx) {
      console.log("📝 [API] Processing Word (.docx) file...");
      
      try {
        // Use require inside function to avoid build-time evaluation
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require('mammoth');
        
        // Handle potentially different export formats (CJS vs ESM interop)
        const mammothFunc = typeof mammoth === 'object' ? mammoth : mammoth.default || mammoth;
        
        console.log("🔧 [API] Calling mammoth to extract text...");
        const result = await mammothFunc.extractRawText({ buffer });
        
        if (!result || !result.value) {
          console.error("❌ [API] mammoth returned empty or invalid data");
          return NextResponse.json({ error: 'Word document parsing returned no text. The file may be corrupted or empty.' }, { status: 500 });
        }
        
        text = result.value;
        console.log(`✅ [API] Word (.docx) Extraction Success! Length: ${text.length} chars`);
        
        // Log warnings if any
        if (result.messages && result.messages.length > 0) {
          console.warn("⚠️ [API] Word document parsing warnings:", result.messages);
        }
      } catch (docxError: any) {
        console.error("❌ [API] Word (.docx) parsing error:", docxError);
        
        return NextResponse.json({ 
          error: `Word document parsing failed: ${docxError.message || 'Unknown error'}. Please ensure the file is a valid .docx file.` 
        }, { status: 500 });
      }
    } else if (isDoc) {
      // .doc files (older binary format) are not easily parseable with standard libraries
      // We'll return a helpful error message suggesting conversion to .docx
      console.error(`❌ [API] Unsupported Word format: .doc (older binary format)`);
      return NextResponse.json({ 
        error: 'Legacy .doc files are not supported. Please convert your document to .docx format and try again. You can do this by opening the file in Microsoft Word and saving it as .docx.' 
      }, { status: 400 });
    } else {
      console.error(`❌ [API] Unsupported file type: ${file.type}`);
      return NextResponse.json({ 
        error: `Unsupported file type: ${file.type || 'unknown'}. Supported formats: PDF (.pdf) and Word (.docx) documents.` 
      }, { status: 400 });
    }

    // Clean up text (remove excessive whitespace)
    text = text.replace(/\n+/g, '\n').trim();

    if (!text || text.length === 0) {
      console.error("❌ [API] Extracted text is empty after processing");
      return NextResponse.json({ 
        error: 'No text could be extracted from the document. The file may be image-only, corrupted, or empty.' 
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

