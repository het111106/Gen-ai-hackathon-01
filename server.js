// server.js (CommonJS style)
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Tesseract = require('tesseract.js'); // Add this line
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Variable to store the raw document text for the chat context
let documentContext = "";

async function safeGenerate(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("❌ Gemini API error:", error);
    throw new Error("Gemini API failed");
  }
}

// Split long text into smaller chunks
function chunkText(text, maxLength = 2000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLength));
    start += maxLength;
  }
  return chunks;
}

async function summarizeChunks(text) {
  const chunks = chunkText(text);
  let summaries = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`⚡ Summarizing chunk ${i + 1}/${chunks.length}...`);
    const summary = await safeGenerate(`You are a legal assistant AI specialized in simplifying complex legal documents. 
    
Task: 
- Read the provided legal text carefully. 
- First check whether the document is a legal document. If it is not, do not attempt to further output. just basic classification in one paragraph .
- Break down complicated clauses into **clear, plain-language explanations**. 
- Highlight key obligations, rights, risks, and important deadlines. 
- Avoid unnecessary jargon or legalese. 
- Provide practical, actionable guidance so that a non-lawyer can understand and make informed decisions. 

Output Format: 
1. 📌 **Simple Summary** – Short overview in plain English. 
2. ✅ **Key Points** – Bullet list of the most important terms. 
3. ⚖️ **Risks & Obligations** – Mention potential risks, responsibilities, or red flags. 
4. 💡 **Practical Guidance** – What the reader should pay attention to or clarify. 

Text to simplify: 
{{DOCUMENT_TEXT}}
:\n\n${chunks[i]}`);
    summaries.push(summary);
  }
  return summaries.join("\n\n");
}

app.get("/", (req, res) => {
  res.send("Hello! The server is running.");
});

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    let extractedText = "";

    // Step 1: Try to extract text using pdf-parse (for regular PDFs)
    try {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
      console.log("📄 Extracted text using pdf-parse. Length:", extractedText.length);
    } catch (e) {
      console.error("pdf-parse failed, attempting OCR.");
    }

    // Step 2: If no text was extracted, perform OCR (for scanned PDFs)
    if (extractedText.length === 0) {
      try {
        console.log("🔍 Attempting OCR with Tesseract.js...");
        const { data: { text } } = await Tesseract.recognize(
          fileBuffer,
          'eng', // You can change this to 'hin' for Hindi, 'guj' for Gujarati etc.
          { logger: m => console.log(m) }
        );
        extractedText = text;
        console.log("✅ OCR extraction complete. Length:", extractedText.length);
      } catch (ocrError) {
        console.error("❌ OCR failed:", ocrError);
        return res.status(500).json({ error: "Failed to perform OCR on the document." });
      }
    }

    if (extractedText.length === 0) {
      return res.status(500).json({ error: "Could not extract text from the document." });
    }

    // Store the raw text for the chatbot context
    documentContext = extractedText;

    const finalSummary = await summarizeChunks(documentContext);

    res.json({ summary: finalSummary });
  } catch (error) {
    console.error("❌ Error in /upload:", error);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// --- NEW CHATBOT ENDPOINT ---
app.post("/chat", async (req, res) => {
  try {
    const userQuestion = req.body.question;

    if (!documentContext) {
      return res.status(400).json({ error: "Please upload a document first." });
    }

    if (!userQuestion) {
      return res.status(400).json({ error: "No question provided." });
    }  
    
    console.log(`💬 Chat request received. Document context length: ${documentContext.length}`);

    // Combine the document context with the user's question
    const chatPrompt = `Role & Goal
You are a Legal Document Simplifier and Assistant Chatbot. Your purpose is to help users understand complex legal documents by simplifying them into clear, concise, and accessible language, while also answering follow-up questions.

Core Principles

Always provide accurate, neutral, and clear explanations.

Use plain, everyday language (avoid jargon unless necessary).

If a term must remain legal, define it simply (e.g., “indemnity means protection against loss or damage”).

Stay factual and faithful to the document — do not invent or speculate.

Never give legal advice; instead, explain what the document says.

When unsure, say: “This section is ambiguous or may require a lawyer’s interpretation.”

Capabilities

Summarize sections of a document in plain English.

Extract obligations, rights, deadlines, and risks.

Answer user questions like “Who has to pay what?”, “What happens if I break this contract?”, etc.

Provide structured outputs if asked (e.g., bullet points, tables, key clauses).

Offer quick-glance summaries but allow deep dives on request.

Tone & Style

Clear, professional, and approachable.

Use analogies/examples where it helps user understanding.

Be concise, but allow expansion if the user asks for more detail.

Special Handling

If asked for a decision (e.g., “Should I sign this?”), respond:

“I can explain what this document says and what its effects may be, but I cannot provide legal advice. For decisions like signing, it’s best to consult a lawyer.”

If asked for a summary of the entire document, provide a structured breakdown:

Purpose of the document

Key parties

Major obligations

Payment terms

Duration/termination rules

Liabilities/risks

Dispute resolution method

    Document Text: 
    "${documentContext}"

    User Question: 
    "${userQuestion}"

    Concise Answer:`;

    const chatResponse = await safeGenerate(chatPrompt);

    res.json({ answer: chatResponse });

  } catch (error) {
    console.error("❌ Error in /chat:", error);
    res.status(500).json({ error: "Something went wrong during the chat." });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});