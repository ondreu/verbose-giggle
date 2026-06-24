import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface WorldInfo {
  id: string;
  name: string;
}

const TEXT_RE = /\.(md|markdown|ya?ml|json|txt|svg|csv)$/i;

/**
 * World management modal (#worlds): browse a shared world's vault files, edit
 * text files in place, download the whole world as a .zip, or upload a .zip to
 * merge/replace its files. Opened per-world from the start menu.
 */
export function WorldManager({ world, onClose }: { world: WorldInfo; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshFiles = () =>
    fetch(`/api/worlds/${encodeURIComponent(world.id)}/files`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((d) => setFiles(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFiles([]));

  useEffect(() => {
    void refreshFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

  const open = async (f: string) => {
    setSelected(f);
    setFileError(null);
    setStatus(null);
    if (!TEXT_RE.test(f)) {
      setContent("");
      setOriginal("");
      return;
    }
    setLoadingFile(true);
    try {
      const res = await fetch(
        `/api/worlds/${encodeURIComponent(world.id)}/file?path=${encodeURIComponent(f)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFileError(data.error ?? `Chyba ${res.status}`);
        setContent("");
        setOriginal("");
      } else {
        setContent(data.content ?? "");
        setOriginal(data.content ?? "");
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFile(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    setFileError(null);
    try {
      const res = await fetch(`/api/worlds/${encodeURIComponent(world.id)}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFileError(data.error ?? `Chyba ${res.status}`);
      } else {
        setOriginal(content);
        setStatus("Uloženo.");
        void refreshFiles();
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setStatus(null);
    setFileError(null);
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch(`/api/worlds/${encodeURIComponent(world.id)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zipBase64: b64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFileError(data.error ?? `Chyba ${res.status}`);
      } else {
        setStatus(`Nahráno ${data.written ?? 0} souborů.`);
        await refreshFiles();
        // Re-open the current file so edits reflect the uploaded version.
        if (selected && TEXT_RE.test(selected)) await open(selected);
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const dirty = selected != null && TEXT_RE.test(selected) && content !== original;
  const isText = selected != null && TEXT_RE.test(selected);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex h-[85vh] w-full max-w-4xl flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="globe" size={18} className="text-ink" />
          <h2 className="font-display text-lg">{world.name}</h2>
          <span className="font-log text-[11px] text-ink/55">{world.id}</span>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr]">
          {/* File tree */}
          <div className="min-h-0 overflow-y-auto rounded-sm border border-ink/15 bg-ink/5 p-2">
            {files === null ? (
              <p className="font-body italic text-ink/60">Načítám soubory…</p>
            ) : files.length === 0 ? (
              <p className="font-body italic text-ink/60">Žádné soubory.</p>
            ) : (
              <ul className="font-log text-[12px]">
                {files.map((f) => {
                  const active = f === selected;
                  return (
                    <li key={f}>
                      <button
                        onClick={() => void open(f)}
                        className={`flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors ${
                          active ? "bg-ink/15 text-ink" : "text-ink/75 hover:bg-ink/10 hover:text-ink"
                        }`}
                        title={f}
                      >
                        <Icon
                          name={TEXT_RE.test(f) ? "scroll" : "camera"}
                          size={11}
                          className="shrink-0 text-ink/40"
                        />
                        <span className="truncate">{f}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Editor / preview */}
          <div className="flex min-h-0 flex-col">
            {selected == null ? (
              <p className="m-auto max-w-xs text-center font-body italic text-ink/55">
                Vyber soubor vlevo. Textové soubory (.md, .yaml, .json, .svg…) lze upravit a uložit.
              </p>
            ) : !isText ? (
              <div className="m-auto flex flex-col items-center gap-2 text-center">
                <Icon name="camera" size={26} className="text-ink/40" />
                <p className="font-body text-sm text-ink/70">
                  Binární soubor — upravovat nelze. Stáhni celý svět jako ZIP níže.
                </p>
              </div>
            ) : loadingFile ? (
              <p className="m-auto font-body italic text-ink/60">Načítám…</p>
            ) : (
              <textarea
                className="min-h-0 flex-1 resize-none rounded-sm border border-ink/20 bg-bg-crust/40 p-2 font-log text-[12px] leading-relaxed text-ink outline-none focus:border-gold/50"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
            )}
            {isText && !loadingFile && (
              <div className="mt-2 flex items-center gap-3">
                <button
                  className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                >
                  {saving ? "Ukládám…" : dirty ? "Uložit změny" : "Uloženo"}
                </button>
                {status && <span className="font-log text-xs text-verdigris">{status}</span>}
                {fileError && <span className="font-log text-xs text-blood">{fileError}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Download / upload */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/20 pt-3">
          <a
            className="flex items-center gap-1.5 rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20"
            href={`/api/worlds/${encodeURIComponent(world.id)}/export`}
            download={`${world.id}.zip`}
          >
            <Icon name="document" size={14} /> Stáhnout ZIP
          </a>
          <button
            className="flex items-center gap-1.5 rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            <Icon name="upload" size={14} /> {uploading ? "Nahrávám…" : "Nahrát ZIP"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <span className="font-log text-[11px] text-ink/50">
            Nahrání ZIP přepíše soubory se stejným názvem a doplní nové.
          </span>
          {!isText && fileError && <span className="ml-auto font-log text-xs text-blood">{fileError}</span>}
        </div>
      </div>
    </div>
  );
}

/** Read a File as base64 (no data: prefix), via FileReader. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Čtení souboru selhalo"));
    reader.readAsDataURL(file);
  });
}
