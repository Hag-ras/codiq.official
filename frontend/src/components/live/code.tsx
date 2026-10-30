'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { cx } from '@/components/ui';
import type { Lang } from './types';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'html', label: 'HTML / CSS' },
];
export const STARTER: Record<Lang, string> = {
  python: '# Python runs right here in your browser\nname = "Codiq"\nfor i in range(3):\n    print("Hello,", name, i)\n',
  javascript: '// JavaScript runs right here in your browser\nconst name = "Codiq";\nfor (let i = 0; i < 3; i++) {\n  console.log("Hello,", name, i);\n}\n',
  html: '<!doctype html>\n<html>\n  <body style="font-family: sans-serif; text-align: center">\n    <h1>Hello Codiq</h1>\n    <button onclick="this.textContent = \'Clicked!\'">Click me</button>\n  </body>\n</html>\n',
};
const ext = (l: Lang) => (l === 'python' ? python() : l === 'html' ? html() : javascript());

function CodeMirror({ value, onChange, lang, readOnly }: { value: string; onChange?: (v: string) => void; lang: Lang; readOnly: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langC = useRef(new Compartment());
  const roC = useRef(new Compartment());
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup, keymap.of([indentWithTab]), oneDark,
          langC.current.of(ext(lang)), roC.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current?.(u.state.doc.toString()); }),
          EditorView.theme({ '&': { height: '100%', fontSize: '15px' }, '.cm-scroller': { fontFamily: 'var(--font-mono), monospace' } }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { view.current?.dispatch({ effects: langC.current.reconfigure(ext(lang)) }); }, [lang]);
  useEffect(() => { view.current?.dispatch({ effects: roC.current.reconfigure(EditorState.readOnly.of(readOnly)) }); }, [readOnly]);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className="h-full min-h-0 overflow-hidden rounded-lg" />;
}

type Line = { t: 'out' | 'err' | 'info'; m: string };

const PY_WORKER = `
let py;
onmessage = async (e) => {
  try {
    if (!py) {
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
      py = await loadPyodide();
    }
    postMessage({ t: 'ready' });
    const q = String(e.data.stdin || '').split('\\n');
    py.setStdin({ stdin: () => (q.length ? q.shift() : undefined) });
    py.setStdout({ batched: (m) => postMessage({ t: 'out', m }) });
    py.setStderr({ batched: (m) => postMessage({ t: 'err', m }) });
    await py.runPythonAsync(e.data.code);
  } catch (err) {
    const lines = String(err && err.message || err).trim().split('\\n');
    postMessage({ t: 'err', m: lines.slice(-6).join('\\n') });
  }
  postMessage({ t: 'done' });
};`;
let pyWorker: Worker | null = null;

function runPython(code: string, stdin: string, push: (l: Line) => void): Promise<void> {
  return new Promise((resolve) => {
    if (!pyWorker) pyWorker = new Worker(URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' })));
    const w = pyWorker;
    let timer = setTimeout(() => finish('Python took too long to start. Check your internet connection and try again.', true), 90_000);
    const finish = (msg?: string, kill?: boolean) => {
      clearTimeout(timer); w.onmessage = null;
      if (kill) { w.terminate(); pyWorker = null; }
      if (msg) push({ t: 'err', m: msg });
      resolve();
    };
    w.onmessage = (e: MessageEvent<{ t: string; m?: string }>) => {
      const d = e.data;
      if (d.t === 'ready') { clearTimeout(timer); timer = setTimeout(() => finish('Stopped: the program ran for more than 10 seconds.', true), 10_000); }
      else if (d.t === 'out' || d.t === 'err') push({ t: d.t, m: d.m ?? '' });
      else if (d.t === 'done') finish();
    };
    push({ t: 'info', m: pyWorker && w ? 'Running…' : '' });
    w.postMessage({ code, stdin });
  });
}

function runJs(code: string, push: (l: Line) => void): Promise<void> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';
    const safe = JSON.stringify(code).replace(/</g, '\\u003c');
    iframe.srcdoc = `<script>
const send = (t, m) => parent.postMessage({ id: ${JSON.stringify(id)}, t, m }, '*');
const fmt = (a) => a.map((x) => { try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch { return String(x); } }).join(' ');
console.log = (...a) => send('out', fmt(a)); console.info = console.log;
console.warn = (...a) => send('out', fmt(a)); console.error = (...a) => send('err', fmt(a));
window.onerror = (m) => { send('err', String(m)); };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
new AsyncFunction(${safe})().then(() => send('done'), (e) => { send('err', String((e && e.stack) || e).split('\\n').slice(0, 4).join('\\n')); send('done'); });
<\/script>`;
    const done = (msg?: string) => { clearTimeout(timer); window.removeEventListener('message', on); iframe.remove(); if (msg) push({ t: 'err', m: msg }); resolve(); };
    const timer = setTimeout(() => done('Stopped: the program ran for more than 8 seconds.'), 8000);
    const on = (e: MessageEvent<{ id?: string; t?: string; m?: string }>) => {
      if (e.data?.id !== id) return;
      if (e.data.t === 'done') done();
      else if (e.data.t === 'out' || e.data.t === 'err') push({ t: e.data.t, m: e.data.m ?? '' });
    };
    window.addEventListener('message', on);
    document.body.appendChild(iframe);
  });
}

/**
 * Code editor for the classroom. Everyone has their own editor that can run Python, JavaScript or HTML in the
 * browser. The host can share theirs: students then get an extra read-only tab that follows it live.
 */
export function CodePanel({ isHost, shared, onShare, onRun }: {
  onRun?: () => void;
  isHost: boolean;
  shared: { lang: Lang; code: string } | null;
  onShare: (on: boolean, lang: Lang, code: string) => void;
}) {
  const [lang, setLang] = useState<Lang>('python');
  const [code, setCode] = useState(STARTER.python);
  const [tab, setTab] = useState<'mine' | 'host'>('mine');
  const [sharing, setSharing] = useState(false);
  const [out, setOut] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const viewingHost = !isHost && tab === 'host' && !!shared;
  const shownLang = viewingHost ? shared!.lang : lang;
  const shownCode = viewingHost ? shared!.code : code;
  useEffect(() => { if (!shared) setTab('mine'); }, [shared]);

  // While sharing, push edits to the class (debounced).
  const broadcast = useCallback((on: boolean, l: Lang, c: string) => { clearTimeout(timer.current); timer.current = setTimeout(() => onShare(on, l, c), on ? 250 : 0); }, [onShare]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const edit = (v: string) => { setCode(v); if (sharing) broadcast(true, lang, v); };
  const pickLang = (l: Lang) => {
    const untouched = Object.values(STARTER).includes(code) || !code.trim();
    const next = untouched ? STARTER[l] : code;
    setLang(l); setCode(next); setPreview(null);
    if (sharing) broadcast(true, l, next);
  };
  const toggleShare = () => { const on = !sharing; setSharing(on); broadcast(on, lang, code); };

  const run = async () => {
    const l = shownLang, c = shownCode;
    onRun?.();
    setRunning(true); setOut([]); setPreview(null);
    const push = (line: Line) => setOut((o) => (line.t === 'info' ? [line] : [...o.filter((x) => x.t !== 'info'), line]));
    try {
      if (l === 'html') setPreview(c);
      else if (l === 'javascript') await runJs(c, push);
      else await runPython(c, stdin, push);
    } finally { setRunning(false); setOut((o) => o.filter((x) => x.t !== 'info')); }
  };

  const pill = (active: boolean) => cx('min-h-9 rounded-lg px-3 text-sm font-semibold', active ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {shared && !isHost && (
          <>
            <button className={pill(tab === 'mine')} onClick={() => setTab('mine')}>My code</button>
            <button className={pill(tab === 'host')} onClick={() => setTab('host')}>● Instructor&apos;s code</button>
            <span className="mx-1 h-5 w-px bg-white/20" />
          </>
        )}
        <select aria-label="Language" value={shownLang} disabled={viewingHost} onChange={(e) => pickLang(e.target.value as Lang)}
          className="min-h-9 rounded-lg bg-white/10 px-2 text-sm font-semibold text-white disabled:opacity-70">
          {LANGS.map((l) => <option key={l.id} value={l.id} className="text-ink">{l.label}</option>)}
        </select>
        <button className="min-h-9 rounded-lg bg-clay px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60" disabled={running} onClick={run}>{running ? 'Running…' : '▶ Run'}</button>
        {viewingHost && <button className={pill(false)} onClick={() => { setLang(shared!.lang); setCode(shared!.code); setTab('mine'); }}>Copy to my editor</button>}
        {isHost && <button className={pill(sharing)} onClick={toggleShare}>{sharing ? '● Sharing with class (stop)' : 'Share with class'}</button>}
        {!viewingHost && <button className={pill(false)} onClick={() => { setCode(STARTER[lang]); setPreview(null); if (sharing) broadcast(true, lang, STARTER[lang]); }}>Reset</button>}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <div className="min-h-[240px]"><CodeMirror value={shownCode} lang={shownLang} readOnly={viewingHost} onChange={viewingHost ? undefined : edit} /></div>
        <div className="flex min-h-[200px] flex-col gap-2">
          {shownLang === 'html' && preview !== null ? (
            <iframe title="Preview" sandbox="allow-scripts" srcDoc={preview} className="min-h-0 flex-1 rounded-lg bg-white" />
          ) : (
            <pre aria-live="polite" className="min-h-0 flex-1 overflow-auto rounded-lg bg-[#0d0e10] p-3 font-mono text-[14px] leading-6 whitespace-pre-wrap text-white/90">
              {out.length === 0 && <span className="text-white/40">Output shows here. Press Run.</span>}
              {out.map((l, i) => <span key={i} className={cx('block', l.t === 'err' && 'text-[#f08a7a]', l.t === 'info' && 'text-white/50')}>{l.m}</span>)}
            </pre>
          )}
          {shownLang === 'python' && (
            <details className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80">
              <summary className="cursor-pointer font-semibold">Input for input() — one line per call</summary>
              <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={3} className="mt-2 w-full rounded bg-black/40 p-2 font-mono text-white outline-none" />
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
