import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  parseCSV, mapearImport, importarPacientes,
  type LinhaImport, type ResultadoImport,
} from "@/services/pacientes";
import { toast } from "sonner";
import { traduzErro } from "@/lib/erros";

// ============================================================================
// Importar pacientes por CSV — a porta de entrada da migração
// ----------------------------------------------------------------------------
// Sobe o CSV do sistema antigo (ou cola o conteúdo). O parser tolera cabeçalhos
// variados e datas dd/mm/aaaa; deduplica por celular. Insere em lote.
// ============================================================================

interface Props {
  clinicaId: string | null;
  aberto: boolean;
  onFechar: () => void;
  onImportado: () => void;
}

export function ImportarPacientesDialog({ clinicaId, aberto, onFechar, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaImport[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  const reset = () => { setLinhas([]); setNomeArquivo(""); setResultado(null); };
  const fechar = () => { reset(); onFechar(); };

  const lerArquivo = async (file: File) => {
    const texto = await file.text();
    const parsed = mapearImport(parseCSV(texto)).filter((l) => l.nome || l.celular);
    setNomeArquivo(file.name);
    setLinhas(parsed);
    setResultado(null);
  };

  const validas = linhas.filter((l) => l.nome && l.celular.replace(/\D/g, "").length >= 10 && l.nascimento).length;

  const importar = async () => {
    if (!clinicaId || linhas.length === 0) return;
    setImportando(true);
    try {
      const r = await importarPacientes(clinicaId, linhas);
      setResultado(r);
      if (r.inseridos > 0) { toast.success(`${r.inseridos} paciente(s) importado(s)`); onImportado(); }
      else toast.info("Nenhum paciente novo importado");
    } catch (e: any) {
      toast.error("Falha na importação", { description: traduzErro(e) });
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar pacientes</DialogTitle>
          <DialogDescription>
            Suba um arquivo CSV do seu sistema atual. Colunas reconhecidas: nome, celular,
            nascimento, CPF, e-mail. Pacientes com celular já cadastrado são ignorados.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              <span><strong>{resultado.inseridos}</strong> importados · {resultado.pulados} ignorados (duplicados/ inválidos)</span>
            </div>
            {resultado.erros.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {resultado.erros.slice(0, 20).map((e, i) => <p key={i}>{e}</p>)}
                {resultado.erros.length > 20 && <p>…e mais {resultado.erros.length - 20}.</p>}
              </div>
            )}
            <Button className="w-full" onClick={fechar}>Concluir</Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-8 text-center transition hover:bg-brand-50"
            >
              <Upload className="h-8 w-8 text-brand-600" />
              <span className="text-sm font-medium">
                {nomeArquivo || "Clique para escolher o arquivo CSV"}
              </span>
              <span className="text-xs text-muted-foreground">.csv exportado do Excel/sistema antigo</span>
            </button>
            <input
              ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
            />

            {linhas.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span>{linhas.length} linhas lidas · <strong>{validas}</strong> válidas para importar</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button disabled={validas === 0 || importando} onClick={importar}>
                {importando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando…</> : `Importar ${validas}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
