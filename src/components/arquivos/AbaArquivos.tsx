import { traduzErro } from "@/lib/erros";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Upload, Trash2, FileText, ImageIcon, ExternalLink, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listarArquivos, subirArquivo, urlDoArquivo, excluirArquivo, tamanhoLegivel, ehImagem,
  CATEGORIAS_ARQUIVO, MAX_ARQUIVO_BYTES, type ArquivoRow,
} from "@/services/arquivos";

// ============================================================================
// Aba Arquivos (anexos do paciente) — exames, raio-x, fotos, documentos no R2.
// Os bytes sobem/baixam direto do R2 por URL pré-assinada; aqui só a UI.
// ============================================================================

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Miniatura de imagem: busca a URL pré-assinada só quando o card monta. */
function Miniatura({ arquivoId, nome }: { arquivoId: string; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    urlDoArquivo(arquivoId).then((u) => vivo && setUrl(u)).catch(() => vivo && setErro(true));
    return () => { vivo = false; };
  }, [arquivoId]);
  if (erro) return <div className="flex h-full w-full items-center justify-center bg-muted"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>;
  if (!url) return <div className="flex h-full w-full items-center justify-center bg-muted"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return <img src={url} alt={nome} className="h-full w-full object-cover" loading="lazy" />;
}

export function AbaArquivos({ clinicaId, pacienteId }: { clinicaId: string; pacienteId: string }) {
  const [arquivos, setArquivos] = useState<ArquivoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [categoria, setCategoria] = useState<string>("exame");
  const [aExcluir, setAExcluir] = useState<ArquivoRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      setArquivos(await listarArquivos(clinicaId, pacienteId));
    } catch (e) {
      toast.error("Erro ao carregar arquivos", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clinicaId, pacienteId]);

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    if (file.size > MAX_ARQUIVO_BYTES) { toast.error("Arquivo acima de 25 MB."); return; }
    setEnviando(true);
    try {
      await subirArquivo({ file, pacienteId, categoria });
      toast.success("Arquivo enviado");
      await carregar();
    } catch (err) {
      toast.error("Falha no envio", { description: traduzErro(err) });
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (a: ArquivoRow) => {
    try {
      const url = await urlDoArquivo(a.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Não foi possível abrir", { description: traduzErro(e) });
    }
  };

  const confirmarExcluir = async () => {
    if (!aExcluir) return;
    setExcluindo(true);
    try {
      await excluirArquivo(aExcluir.id);
      setArquivos((prev) => prev.filter((x) => x.id !== aExcluir.id));
      setAExcluir(null);
      toast.success("Arquivo excluído");
    } catch (e) {
      toast.error("Falha ao excluir", { description: traduzErro(e) });
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* barra: categoria + enviar */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIAS_ARQUIVO.map((c) => (
          <button
            key={c.valor}
            onClick={() => setCategoria(c.valor)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              categoria === c.valor ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {c.rotulo}
          </button>
        ))}
        <div className="ml-auto">
          <input ref={inputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={aoEscolher} />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Enviar {CATEGORIAS_ARQUIVO.find((c) => c.valor === categoria)?.rotulo.toLowerCase()}
          </Button>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : arquivos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Paperclip className="h-8 w-8 opacity-50" />
          Nenhum arquivo ainda. Envie exames, raio-x, fotos ou documentos (imagem ou PDF, até 25 MB).
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {arquivos.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-lg border bg-card">
              <button onClick={() => abrir(a)} className="block aspect-square w-full overflow-hidden" title={a.nome_original}>
                {ehImagem(a.content_type) ? (
                  <Miniatura arquivoId={a.id} nome={a.nome_original} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted">
                    <FileText className="h-10 w-10 text-brand-600" />
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {a.content_type === "application/pdf" ? "PDF" : "arquivo"}
                    </span>
                  </div>
                )}
              </button>
              <div className="flex items-center gap-1 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={a.nome_original}>{a.nome_original}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="mr-1 h-4 px-1 text-[9px]">{a.categoria}</Badge>
                    {tamanhoLegivel(a.tamanho_bytes)} · {dataBr(a.created_at)}
                  </p>
                </div>
                <button onClick={() => abrir(a)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Abrir">
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setAExcluir(a)} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{aExcluir?.nome_original}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo é removido do storage e não pode ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); confirmarExcluir(); }} disabled={excluindo}>
              {excluindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
