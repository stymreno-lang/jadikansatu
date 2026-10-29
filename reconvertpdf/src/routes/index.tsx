import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Upload, X, GripVertical, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, FileType2, Image as ImageIcon,
  Loader2, CheckCircle2, AlertCircle, Layers,
} from "lucide-react";
import { detectKind, type Kind } from "@/lib/pdf-merge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jadikan satu PDF — Gabungkan file jadi satu PDF" },
      { name: "description", content: "Gabungkan PDF, Word, Excel, dan gambar menjadi satu dokumen PDF dengan cepat dan aman langsung di browser." },
      { property: "og:title", content: "Jadikan satu PDF" },
      { property: "og:description", content: "Gabungkan PDF, Word, Excel, dan gambar menjadi satu PDF — aman, tanpa upload ke server." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Item = { id: string; file: File; kind: Kind; thumb?: string | null | undefined };
type Toast = { id: number; msg: string; type: "error" | "success" };

const KIND_META: Record<Kind, { label: string; Icon: typeof FileText }> = {
  pdf: { label: "PDF", Icon: FileType2 },
  docx: { label: "DOCX", Icon: FileText },
  xlsx: { label: "XLSX", Icon: FileSpreadsheet },
  img: { label: "IMG", Icon: ImageIcon },
};

function Index() {
  const [items, setItems] = useState<Item[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modal, setModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  const show = useCallback((msg: string, type: Toast["type"]) => {
    setToast({ id: Date.now(), msg, type });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Revoke object URLs for images on unmount
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.kind === "img" && i.thumb && URL.revokeObjectURL(i.thumb)), []);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Item[] = [];
    let rejected = 0;
    for (const file of Array.from(list)) {
      const kind = detectKind(file.name);
      if (!kind) { rejected++; continue; }
      next.push({ id: `f${idRef.current++}`, file, kind, thumb: kind === "img" ? URL.createObjectURL(file) : undefined });
    }
    if (rejected) show(`${rejected} file tidak didukung dan dilewati.`, "error");
    setItems((p) => [...p, ...next]);
    const { pdfThumbnail } = await import("@/lib/pdf-merge");
    for (const it of next.filter((n) => n.kind === "pdf")) {
      const thumb = await pdfThumbnail(it.file);
      setItems((p) => p.map((x) => (x.id === it.id ? { ...x, thumb } : x)));
    }
  };

  const remove = (id: string) =>
    setItems((p) => {
      const it = p.find((x) => x.id === id);
      if (it?.kind === "img" && it.thumb) URL.revokeObjectURL(it.thumb);
      return p.filter((x) => x.id !== id);
    });
  const move = (i: number, d: number) => setItems((p) => (i + d < 0 || i + d >= p.length ? p : arrayMove(p, i, i + d)));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((p) => arrayMove(p, p.findIndex((x) => x.id === active.id), p.findIndex((x) => x.id === over.id)));
  };

  const onConvert = () => {
    if (items.length < 2) return show("Pilih minimal 2 file untuk digabungkan.", "error");
    setModal(true);
  };

  return (
    <main className="min-h-screen bg-background font-sans text-foreground antialiased">
      <div className="mx-auto max-w-5xl px-5 pb-32 pt-16 sm:pt-24">
        <header className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
            <Layers className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Jadikan satu PDF</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            Gabungkan PDF, Word, Excel, dan gambar menjadi satu dokumen PDF dengan cepat dan aman.
          </p>
        </header>

        <section
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          className={`mt-10 rounded-3xl border-2 border-dashed p-10 text-center transition-colors sm:p-14 ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted"
          }`}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-soft">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="press mt-6 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:bg-primary/90"
          >
            Pilih File
          </button>
          <p className="mt-3 text-sm text-muted-foreground">atau seret file ke sini (PDF, Word, Excel, Gambar)</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".pdf, .docx, .doc, .xlsx, .xls, .png, .jpg, .jpeg"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
        </section>

        {items.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {items.length} file · urutan penggabungan
              </h2>
              <button onClick={() => setItems([])} className="press text-sm font-medium text-primary">Hapus semua</button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((it, i) => (
                    <FileCard key={it.id} item={it} index={i} total={items.length} onRemove={remove} onMove={move} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-glass px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl justify-center">
          <button
            onClick={onConvert}
            className="press w-full max-w-sm rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow hover:bg-primary/90 hover:shadow-[0_14px_40px_-8px_var(--primary)]"
          >
            Convert PDF Now
          </button>
        </div>
      </div>

      {modal && (
        <FilenameModal
          items={items}
          onClose={() => setModal(false)}
          onDone={(name) => { setModal(false); show(`${name} berhasil diunduh.`, "success"); }}
          onError={(m) => show(m, "error")}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed left-1/2 top-5 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-glass px-5 py-3 text-sm font-medium shadow-soft backdrop-blur-md ${
            toast.type === "error" ? "animate-shake text-destructive" : "animate-drop text-success"
          }`}
        >
          {toast.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span className="text-foreground">{toast.msg}</span>
        </div>
      )}
    </main>
  );
}

function FileCard({
  item, index, total, onRemove, onMove,
}: { item: Item; index: number; total: number; onRemove: (id: string) => void; onMove: (i: number, d: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const { label, Icon } = KIND_META[item.kind];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft ${isDragging ? "z-10 scale-105 shadow-glow" : ""}`}
    >
      <div {...attributes} {...listeners} className="relative flex h-44 cursor-grab touch-none items-center justify-center bg-muted active:cursor-grabbing">
        {item.thumb ? (
          <img src={item.thumb} alt={item.file.name} className="h-full w-full object-contain p-3" draggable={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-primary">
            <Icon className="h-12 w-12" strokeWidth={1.5} />
            <span className="text-xs font-bold tracking-wider">{label}</span>
          </div>
        )}
        <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-glass text-xs font-semibold shadow-soft backdrop-blur-md">
          {index + 1}
        </span>
        <GripVertical className="absolute right-3 bottom-3 h-5 w-5 text-muted-foreground" />
      </div>
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Hapus file"
        className="press absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-glass text-muted-foreground shadow-soft backdrop-blur-md hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 p-3">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{label}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={item.file.name}>{item.file.name}</p>
        <button disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Geser ke kiri"
          className="press flex h-8 w-8 items-center justify-center rounded-full bg-muted disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button disabled={index === total - 1} onClick={() => onMove(index, 1)} aria-label="Geser ke kanan"
          className="press flex h-8 w-8 items-center justify-center rounded-full bg-muted disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FilenameModal({
  items, onClose, onDone, onError,
}: { items: Item[]; onClose: () => void; onDone: (n: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState("dokumen-gabungan");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const submit = async () => {
    if (!name.trim()) return setErr("Nama file tidak boleh kosong.");
    const final = /\.pdf$/i.test(name.trim()) ? name.trim() : `${name.trim()}.pdf`;
    setBusy(true);
    try {
      const { mergeFiles } = await import("@/lib/pdf-merge");
      const bytes = await mergeFiles(items);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = final;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onDone(final);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Gagal memproses PDF.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal className="animate-pop w-full max-w-sm rounded-3xl bg-card p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-center text-lg font-semibold">Nama File Output</h3>
        <p className="mt-1 text-center text-sm text-muted-foreground">Masukkan nama untuk dokumen PDF hasil penggabungan.</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className={`mt-5 flex items-center rounded-2xl border bg-muted px-4 focus-within:border-primary ${err ? "border-destructive" : "border-border"}`}>
            <input
              ref={ref}
              value={name}
              disabled={busy}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
            />
            <span className="text-muted-foreground">.pdf</span>
          </div>
          {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={onClose} className="press rounded-2xl bg-muted py-3 text-sm font-semibold text-muted-foreground">
              Batal
            </button>
            <button type="submit" disabled={busy} className="press flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-80">
              {busy ? (<><Loader2 className="h-4 w-4 animate-spin" />Memproses PDF...</>) : "Unduh PDF"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
