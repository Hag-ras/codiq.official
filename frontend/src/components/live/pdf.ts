import { api } from '@/lib/api';

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } }> };
const docs = new Map<string, Promise<PdfDoc>>();
const pages = new Map<string, string>();

/** Downloads a session material PDF (through a signed URL) and opens it with pdf.js. Cached per material. */
export function openPdf(materialId: string): Promise<PdfDoc> {
  let p = docs.get(materialId);
  if (!p) {
    p = (async () => {
      // pdf.js 4 uses Promise.withResolvers, which older Safari lacks.
      const P = Promise as unknown as { withResolvers?: () => unknown };
      if (!P.withResolvers) P.withResolvers = function () { let resolve!: (v: unknown) => void, reject!: (e: unknown) => void; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const { url } = await api<{ url: string }>(`/materials/${materialId}/download`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not load the slides');
      return (await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise) as unknown as PdfDoc;
    })();
    p.catch(() => docs.delete(materialId));
    docs.set(materialId, p);
  }
  return p;
}

/** Renders one page (1-based) to a PNG data URL, 1600px wide. */
export async function renderPage(materialId: string, n: number): Promise<{ src: string; ratio: number }> {
  const key = `${materialId}:${n}`;
  const doc = await openPdf(materialId);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ratio = base.width / base.height;
  const cached = pages.get(key);
  if (cached) return { src: cached, ratio };
  const vp = page.getViewport({ scale: 1600 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const src = canvas.toDataURL('image/jpeg', 0.88);
  pages.set(key, src);
  return { src, ratio };
}
