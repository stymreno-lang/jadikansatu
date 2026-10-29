// Browser-only helpers: import this module dynamically from event handlers/effects.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type Kind = "pdf" | "docx" | "xlsx" | "img";

export function detectKind(name: string): Kind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (["png", "jpg", "jpeg"].includes(ext)) return "img";
  return null;
}

const A4: [number, number] = [595.28, 841.89];
const M = 50;

// Standard fonts only support WinAnsi; replace unsupported characters.
function clean(font: PDFFont, s: string) {
  let out = "";
  for (const ch of s.replace(/\t/g, "    ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = clean(font, para).split(" ");
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

async function addText(out: PDFDocument, text: string) {
  const font = await out.embedFont(StandardFonts.Helvetica);
  const size = 11, lh = 15;
  let page = out.addPage(A4);
  let y = A4[1] - M;
  for (const l of wrap(font, text, size, A4[0] - 2 * M)) {
    if (y < M) {
      page = out.addPage(A4);
      y = A4[1] - M;
    }
    page.drawText(l, { x: M, y, size, font, color: rgb(0.1, 0.1, 0.12) });
    y -= lh;
  }
}

async function addSheets(out: PDFDocument, buf: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const size = 8, rowH = 16;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, defval: "" });
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const landscape = cols > 6;
    const [W, H] = landscape ? [A4[1], A4[0]] : A4;
    const colW = (W - 2 * M) / cols;
    let page: PDFPage = out.addPage([W, H]);
    let y = H - M;
    page.drawText(clean(bold, name), { x: M, y, size: 13, font: bold });
    y -= 24;
    rows.forEach((r, ri) => {
      if (y < M) {
        page = out.addPage([W, H]);
        y = H - M;
      }
      if (ri === 0) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: rgb(0.93, 0.97, 0.95) });
      for (let c = 0; c < cols; c++) {
        const f = ri === 0 ? bold : font;
        let t = clean(f, String(r[c] ?? ""));
        while (t && f.widthOfTextAtSize(t, size) > colW - 6) t = t.slice(0, -1);
        page.drawText(t, { x: M + c * colW + 3, y, size, font: f });
      }
      page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.87) });
      y -= rowH;
    });
  }
}

export async function mergeFiles(files: { file: File; kind: Kind }[]) {
  const out = await PDFDocument.create();
  for (const { file, kind } of files) {
    const buf = await file.arrayBuffer();
    if (kind === "pdf") {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else if (kind === "img") {
      const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
      const img = isPng ? await out.embedPng(buf) : await out.embedJpg(buf);
      const s = Math.min((A4[0] - 2 * M) / img.width, (A4[1] - 2 * M) / img.height, 1);
      const w = img.width * s, h = img.height * s;
      const page = out.addPage(A4);
      page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
    } else if (kind === "docx") {
      if (/\.doc$/i.test(file.name)) throw new Error(`Format .doc lama tidak didukung: ${file.name}. Simpan sebagai .docx.`);
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
      await addText(out, value.trim() || "(Dokumen kosong)");
    } else {
      await addSheets(out, buf);
    }
  }
  return out.save();
}

export async function pdfThumbnail(file: File): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 0.6 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
