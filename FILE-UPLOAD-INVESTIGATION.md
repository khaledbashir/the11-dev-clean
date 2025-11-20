# File Upload Investigation Report

## Summary

The app has **TWO DIFFERENT file upload systems** with different capabilities:

1. **Simple Text Extraction** (Chat Interface) - PDF only, no RAG
2. **RAG Document Upload** (Workspace) - PDF, Word, Text files, with chunking and embedding

---

## 1. File Types Accepted

### ✅ Supported File Types:
- **PDF** (`.pdf`) - `application/pdf`
- **Word Documents** (`.doc`, `.docx`) - `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **Text Files** (`.txt`, `.md`) - `text/plain`, `text/markdown`

### 📏 File Size Limit:
- **Maximum:** 50MB per file

---

## 2. Upload System #1: Simple Text Extraction (Chat Interface)

### Location:
- **Frontend:** `frontend/hooks/useChatManager.ts` → `handleFileUpload()`
- **API Route:** `frontend/app/api/extract-text/route.ts`

### How It Works:
1. User uploads file via chat interface
2. File is sent to `/api/extract-text`
3. **ONLY PDF files are processed** (Word files are rejected with error)
4. Uses `pdf-parse` library to extract raw text from PDF
5. Extracted text is sent directly to AI in the chat prompt as context
6. **NO chunking, NO embedding, NO RAG**

### Code Evidence:
```typescript
// frontend/app/api/extract-text/route.ts (line 40-87)
if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    // Process PDF with pdf-parse
    const data = await parseFunc(buffer);
    text = data.text;
} else {
    // Rejects non-PDF files
    return NextResponse.json({ 
        error: `Unsupported file type... Only PDF files are supported for context injection.` 
    }, { status: 400 });
}
```

### Usage:
- Used when uploading briefs in the chat interface
- Text is injected directly into the prompt: `"Here is the Raw Client Brief. Read this fully before responding:\n\n${rawText}"`
- **This is NOT RAG** - it's just direct text injection into the conversation

---

## 3. Upload System #2: RAG Document Upload (Workspace)

### Location:
- **Frontend:** `frontend/lib/document-pinning.ts` → `uploadAndPinSingleFile()`
- **API Route:** `frontend/app/api/anythingllm/document/upload/route.ts`

### How It Works:
1. User uploads file to workspace
2. File is sent to `/api/anythingllm/document/upload`
3. **Accepts PDF, Word (.doc/.docx), and text files**
4. File is forwarded to AnythingLLM's `/api/v1/document/upload` endpoint
5. AnythingLLM processes the document:
   - **Automatically chunks the content** into smaller pieces
   - **Creates vector embeddings** using the configured embedding engine (Ollama)
   - **Stores embeddings** in vector database (LanceDB)
6. Document is then "pinned" to the workspace for RAG retrieval

### Code Evidence:
```typescript
// frontend/lib/document-pinning.ts (line 135-142)
const validTypes = [
    "application/pdf",
    "application/msword",  // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  // .docx
    "text/plain",
    "text/markdown",
];
const validExtensions = [".pdf", ".doc", ".docx", ".txt", ".md"];
```

### RAG Process Details:
- **Chunking:** AnythingLLM automatically breaks documents into chunks
- **Embedding Engine:** `ollama` (configured in workspace settings)
- **Vector Database:** `lancedb`
- **Retrieval:** When chatting, AnythingLLM retrieves relevant chunks from the vector database based on semantic similarity

### Documentation Reference:
From `frontend/components/tailwind/fromrag-corrected`:
> "Documents uploaded for analysis (briefs, PDFs) must be correctly processed, **chunked, and embedded** to serve as RAG context."
> 
> "**Chunking:** AnythingLLM handles breaking the document content into chunks automatically."
> 
> "**Embedding:** Vector embeddings are created using the configured engine (`ollama`)."
> 
> "**Storage:** The vector database (`lancedb`) stores these embeddings."

---

## 4. Key Differences

| Feature | Chat Upload (extract-text) | Workspace Upload (RAG) |
|---------|---------------------------|------------------------|
| **File Types** | PDF only | PDF, Word (.doc/.docx), Text |
| **Processing** | Simple text extraction | Full RAG pipeline |
| **Chunking** | ❌ No | ✅ Yes (automatic) |
| **Embedding** | ❌ No | ✅ Yes (Ollama) |
| **Vector Storage** | ❌ No | ✅ Yes (LanceDB) |
| **Context Method** | Direct text injection | Semantic retrieval |
| **Use Case** | Quick brief analysis | Persistent document knowledge base |

---

## 5. Current Limitations

### Chat Upload System:
- **Supports PDF and Word (.docx)** - ✅ **UPDATED: Now supports Word documents**
- **No RAG** - entire document text is sent in prompt (may hit token limits for large files)
- **No persistence** - document is not stored, only used for that conversation
- **Note:** Legacy .doc files (older binary format) are not supported - users need to convert to .docx

### Workspace Upload System:
- **Full RAG support** - but only accessible when chatting within that workspace
- **Requires workspace setup** - documents must be uploaded to a specific workspace

---

## 6. Recommendations

1. ~~**Enhance Chat Upload:**~~ ✅ **COMPLETED**
   - ✅ Added Word document support to `/api/extract-text` route
   - ✅ Using `mammoth` library for .docx parsing
   - ⚠️ Legacy .doc files (older binary format) require conversion to .docx

2. **Unify Upload Systems:**
   - Consider making chat uploads also use RAG for better context handling
   - This would allow chunking and semantic retrieval instead of full text injection

3. **Document the Difference:**
   - Make it clear to users which upload method to use
   - Chat upload = quick analysis, Workspace upload = persistent knowledge base

---

## Conclusion

**Answer to your questions:**

1. **Does it accept PDF and Word documents?**
   - ✅ **Workspace upload:** Yes, accepts both PDF and Word (.doc/.docx)
   - ✅ **Chat upload:** Now supports both PDF and Word (.docx) - **UPDATED**

2. **Is it RAG or not?**
   - **Workspace upload:** ✅ **YES, it's RAG** - documents are chunked, embedded, and stored in vector database
   - **Chat upload:** ❌ **NO, it's NOT RAG** - just extracts text and injects it directly into the prompt

The app uses **both approaches** depending on where the file is uploaded:
- Chat interface = simple text extraction (no RAG)
- Workspace = full RAG pipeline with chunking and embedding

