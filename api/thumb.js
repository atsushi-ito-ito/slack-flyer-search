// api/thumb.js
import { put, head } from "@vercel/blob";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

function toDownloadUrl(u) {
  // OneDrive共有URLは直PDFにならないことが多いので、download=1 を試す
  // すでに download=1 があればそのまま
  if (!u) return u;
  if (u.includes("download=1")) return u;
  return u.includes("?") ? `${u}&download=1` : `${u}?download=1`;
}

async function fetchPdfBuffer(url) {
  const res = await fetch(toDownloadUrl(url), { redirect: "follow" });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function renderFirstPageToPng(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(1);

  // ここで解像度を調整（大きいほど綺麗／重くなる）
  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toBuffer("image/png");
}

export default async function handler(req, res) {
  try {
    const pdfUrl = req.query.pdfUrl;
    const fileName = req.query.fileName || "thumb";

    if (!pdfUrl) return res.status(400).json({ error: "pdfUrl is required" });

    // 生成物の保存先キー（同じPDFは同じキーにしてキャッシュ）
    const safeBase = String(fileName).replace(/[^\w.-]+/g, "_").replace(/\.pdf$/i, "");
    const key = `thumbs/${safeBase}.png`;

    // すでにBlobにあればそれを返す（キャッシュ）
    try {
      const meta = await head(key);
      if (meta?.url) return res.status(200).json({ thumbUrl: meta.url, cached: true });
    } catch (_) {
      // headが無い場合は作る
    }

    const pdfBuffer = await fetchPdfBuffer(pdfUrl);
    const png = await renderFirstPageToPng(pdfBuffer);

    const blob = await put(key, png, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false, // 同名で上書き運用（更新したい場合はキーにupdated等を混ぜてもOK）
    });

    return res.status(200).json({ thumbUrl: blob.url, cached: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
