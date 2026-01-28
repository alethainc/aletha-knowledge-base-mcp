import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export type OutputFormat = "text" | "markdown" | "html";

export async function convertToFormat(
  content: string | Buffer,
  mimeType: string,
  format: OutputFormat
): Promise<string> {
  // Handle different source formats
  let textContent: string;
  let htmlContent: string | null = null;

  switch (mimeType) {
    case "application/pdf":
      textContent = await extractPdfText(content as Buffer);
      break;

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      const docxResult = await extractDocxContent(content as Buffer);
      textContent = docxResult.text;
      htmlContent = docxResult.html;
      break;

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      // For spreadsheets, we'd need xlsx library - return as-is for now
      textContent = typeof content === "string" ? content : content.toString("utf-8");
      break;

    case "text/html":
      htmlContent = typeof content === "string" ? content : content.toString("utf-8");
      textContent = htmlToText(htmlContent);
      break;

    case "text/markdown":
    case "text/plain":
    default:
      textContent = typeof content === "string" ? content : content.toString("utf-8");
      break;
  }

  // Convert to requested output format
  switch (format) {
    case "html":
      return htmlContent || textToHtml(textContent);

    case "markdown":
      if (htmlContent) {
        return turndown.turndown(htmlContent);
      }
      return textContent;

    case "text":
    default:
      return textContent;
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error}. Ensure pdf-parse is installed.`);
  }
}

async function extractDocxContent(
  buffer: Buffer
): Promise<{ text: string; html: string }> {
  try {
    const mammothModule = await import("mammoth");
    const result = await mammothModule.convertToHtml({ buffer });
    const textResult = await mammothModule.extractRawText({ buffer });

    return {
      text: textResult.value,
      html: result.value,
    };
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${error}. Ensure mammoth is installed.`);
  }
}

function htmlToText(html: string): string {
  // Simple HTML to text conversion
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<pre>${escaped}</pre>`;
}

export function getMimeTypeDescription(mimeType: string): string {
  const descriptions: Record<string, string> = {
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
    "application/pdf": "PDF",
    "application/msword": "Word Document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
    "application/vnd.ms-excel": "Excel Spreadsheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet",
    "application/vnd.ms-powerpoint": "PowerPoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "text/plain": "Text File",
    "text/markdown": "Markdown",
    "text/html": "HTML",
  };

  return descriptions[mimeType] || mimeType;
}
