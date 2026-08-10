import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImageUp, Loader2, Palette, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { prepararLogo, removerFundoDataUrl, pesoDataUrlKB } from "@/lib/imagem";
import { DocumentoPreview } from "@/components/identidade/DocumentoPreview";
import {
  carregarIdentidade,
  salvarIdentidade,
  mensagemErro,
  corValida,
  CORES_PRESET,
  TEMPLATES,
  POSICOES,
  IDENTIDADE_PADRAO,
  type IdentidadeVisual,
  type DadosClinicaMarca,
} from "@/services/identidadeVisual";

// ============================================================================
// Ajustes › Identidade visual
// ----------------------------------------------------------------------------
// A clínica escolhe cor, modelo de cabeçalho e sobe a logo (posição + remover
// fundo). Tudo com preview ao vivo do lado — o que se vê é o que sai. Some com
// o "cara do banco de dados": nenhum termo técnico, só decisões de marca.
// ============================================================================

const MAX_ARQUIVO = 5 * 1024 * 1024; // 5 MB de entrada; a saída é redimensionada

export default function IdentidadeVisual() {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const [identidade, setIdentidade] = useState<IdentidadeVisual>(IDENTIDADE_PADRAO);
  const [clinica, setClinica] = useState<DadosClinicaMarca>({ nome: "Sua Clínica", cnpj: null, endereco: null, telefone: null });
  const [hex, setHex] = useState(IDENTIDADE_PADRAO.corMarca);

  // guarda a logo redimensionada com o fundo AINDA intacto, pra poder ligar/
  // desligar a remoção de fundo sem pedir o arquivo de novo.
  const [logoBase, setLogoBase] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (carregandoCtx) return;
    if (!clinicaId) { setCarregando(false); return; }
    let vivo = true;
    (async () => {
      try {
        const { identidade: id, clinica: cl } = await carregarIdentidade(clinicaId);
        if (!vivo) return;
        setIdentidade(id);
        setClinica(cl);
        setHex(id.corMarca);
        setLogoBase(id.logoUrl);
      } catch (e) {
        if (vivo) toast.error("Não foi possível carregar", { description: mensagemErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  const patch = (p: Partial<IdentidadeVisual>) => setIdentidade((i) => ({ ...i, ...p }));

  const escolherCor = (cor: string) => { patch({ corMarca: cor }); setHex(cor); };

  const digitarHex = (v: string) => {
    const t = v.startsWith("#") ? v : `#${v}`;
    setHex(t);
    if (corValida(t)) patch({ corMarca: t });
  };

  const aplicarLogo = async (base: string | null, removerFundo: boolean) => {
    if (!base) { patch({ logoUrl: null }); return; }
    const url = removerFundo ? await removerFundoDataUrl(base) : base;
    patch({ logoUrl: url });
  };

  const receberArquivo = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Envie uma imagem (PNG, JPG ou SVG)."); return; }
    if (file.size > MAX_ARQUIVO) { toast.error("Imagem muito grande (máx. 5 MB)."); return; }
    setProcessando(true);
    try {
      const base = await prepararLogo(file);
      setLogoBase(base);
      const url = identidade.logoFundoRemovido ? await removerFundoDataUrl(base) : base;
      patch({ logoUrl: url });
      if (pesoDataUrlKB(url) > 700) {
        toast.warning("Logo pesada", { description: "Ficou grande — prefira um PNG mais leve se puder." });
      }
    } catch (e) {
      toast.error("Não consegui processar a logo", { description: mensagemErro(e) });
    } finally {
      setProcessando(false);
    }
  };

  const alternarFundo = async (v: boolean) => {
    patch({ logoFundoRemovido: v });
    if (!logoBase) return;
    setProcessando(true);
    try {
      await aplicarLogo(logoBase, v);
    } catch (e) {
      toast.error("Não consegui reprocessar", { description: mensagemErro(e) });
    } finally {
      setProcessando(false);
    }
  };

  const removerLogo = () => { setLogoBase(null); patch({ logoUrl: null }); };

  const salvar = async () => {
    if (!clinicaId) return;
    if (!corValida(identidade.corMarca)) { toast.error("Cor inválida", { description: "Use um código como #0077b6." }); return; }
    setSalvando(true);
    try {
      await salvarIdentidade(clinicaId, identidade);
      toast.success("Identidade visual salva", { description: "Seus documentos já saem com essa cara." });
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando || carregandoCtx) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!clinicaId) {
    return <div className="p-8 text-sm text-muted-foreground">Nenhuma clínica ativa.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* cabeçalho da tela */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Identidade visual</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A marca que assina os documentos da sua clínica — cor, modelo e logotipo.
          </p>
        </div>
        <Button onClick={salvar} disabled={salvando} className="gap-2">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        {/* ------------------------------------------------ controles */}
        <div className="space-y-6">
          {/* cor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-brand-600" /> Cor da marca
              </CardTitle>
              <CardDescription>Ela pinta o cabeçalho, os títulos e os detalhes do documento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CORES_PRESET.map((c) => {
                  const ativo = identidade.corMarca.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => escolherCor(c)}
                      aria-label={c}
                      className={cn(
                        "h-9 w-9 rounded-full ring-offset-2 transition-transform hover:scale-105",
                        ativo && "ring-2 ring-gray-900",
                      )}
                      style={{ background: c }}
                    >
                      {ativo && <Check className="mx-auto h-4 w-4" style={{ color: "#fff" }} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-md border" title="Escolher outra cor">
                  <input
                    type="color"
                    value={corValida(identidade.corMarca) ? identidade.corMarca : "#0077b6"}
                    onChange={(e) => escolherCor(e.target.value)}
                    className="absolute -left-1 -top-1 h-12 w-12 cursor-pointer border-0 p-0"
                  />
                </label>
                <div className="grid gap-1.5">
                  <Label htmlFor="hex" className="text-xs text-muted-foreground">Código da cor</Label>
                  <Input
                    id="hex"
                    value={hex}
                    onChange={(e) => digitarHex(e.target.value)}
                    maxLength={7}
                    className="h-9 w-32 font-mono uppercase"
                    placeholder="#0077B6"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* modelo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Modelo do documento</CardTitle>
              <CardDescription>O estilo do cabeçalho. Passe o olho — cada um tem uma personalidade.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map((t) => {
                  const ativo = identidade.template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => patch({ template: t.id })}
                      className={cn(
                        "group rounded-xl border p-2 text-left transition-all",
                        ativo ? "border-brand-500 ring-2 ring-brand-500/30" : "border-gray-200 hover:border-brand-300",
                      )}
                    >
                      <DocumentoPreview
                        compacto
                        identidade={{ ...identidade, template: t.id }}
                        clinica={clinica}
                      />
                      <div className="mt-2 flex items-center justify-between px-1">
                        <span className={cn("text-sm font-semibold", ativo ? "text-brand-700" : "text-gray-800")}>
                          {t.nome}
                        </span>
                        {ativo && <Check className="h-4 w-4 text-brand-600" />}
                      </div>
                      <p className="px-1 pb-1 text-[11px] text-muted-foreground">{t.descricao}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* logo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Logotipo</CardTitle>
              <CardDescription>A logo da clínica. Dá pra posicionar e remover o fundo branco.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { receberArquivo(e.target.files?.[0]); e.currentTarget.value = ""; }}
              />

              {identidade.logoUrl ? (
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-24 w-40 items-center justify-center rounded-lg border p-2"
                    style={{
                      // xadrez sutil pra enxergar transparência
                      backgroundImage:
                        "linear-gradient(45deg,#f1f5f9 25%,transparent 25%),linear-gradient(-45deg,#f1f5f9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1f5f9 75%),linear-gradient(-45deg,transparent 75%,#f1f5f9 75%)",
                      backgroundSize: "14px 14px",
                      backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
                    }}
                  >
                    {processando ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <img src={identidade.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
                      <ImageUp className="mr-2 h-4 w-4" /> Trocar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={removerLogo}>
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); receberArquivo(e.dataTransfer.files?.[0]); }}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-8 text-muted-foreground transition-colors hover:border-brand-300 hover:text-brand-600"
                >
                  {processando ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageUp className="h-6 w-6" />}
                  <span className="text-sm font-medium">Enviar logo</span>
                  <span className="text-[11px]">PNG, JPG ou SVG · até 5 MB · arraste aqui ou clique</span>
                </button>
              )}

              {/* posição */}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Posição no cabeçalho</Label>
                <div className="inline-flex rounded-lg border p-0.5">
                  {POSICOES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => patch({ logoPosicao: p.id })}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm transition-colors",
                        identidade.logoPosicao === p.id ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100",
                      )}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
                {identidade.template === "classico" && (
                  <p className="text-[11px] text-gray-400">O modelo Clássico é sempre centralizado.</p>
                )}
              </div>

              {/* remover fundo */}
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Remover fundo branco</p>
                  <p className="text-[11px] text-muted-foreground">Tira o branco em volta da logo pra ela assentar sobre a cor.</p>
                </div>
                <Switch checked={identidade.logoFundoRemovido} onCheckedChange={alternarFundo} disabled={!logoBase || processando} />
              </label>
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------ preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia ao vivo</p>
          <DocumentoPreview identidade={identidade} clinica={clinica} />
          <p className="mt-2 text-center text-[11px] text-gray-400">
            É assim que atestados, recibos e declarações vão sair.
          </p>
        </div>
      </div>
    </div>
  );
}
