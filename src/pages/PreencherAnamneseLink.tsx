import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { traduzErro } from "@/lib/erros";
import {
  infoLinkAnamnese, responderLinkAnamnese, formatarCelular,
  type PerguntaAnamnese,
} from "@/services/pacientes";

// Página pública (sem login) para o paciente preencher a ficha a partir do link.
// Toda a validação de verdade está nas funções do banco; aqui só a experiência.
export default function PreencherAnamneseLink() {
  const { token = "" } = useParams();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState<{ clinica: string; modelo: string; perguntas: PerguntaAnamnese[] } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});

  useEffect(() => {
    infoLinkAnamnese(token)
      .then(setInfo)
      .catch((e) => setErro(traduzErro(e)))
      .finally(() => setCarregando(false));
  }, [token]);

  const set = (id: string, v: unknown) => setRespostas((r) => ({ ...r, [id]: v }));

  const enviar = async () => {
    setEnviando(true);
    try {
      await responderLinkAnamnese({ token, nome, celular, nascimento, respostas });
      setPronto(true);
    } catch (e: any) {
      toast.error("Não foi possível enviar", { description: traduzErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const renderPergunta = (p: PerguntaAnamnese) => {
    if (p.tipo === "secao") {
      return <p className="text-sm font-semibold text-gray-900 pt-2">{p.enunciado}</p>;
    }
    const val = respostas[p.id];
    const label = (
      <Label className="text-sm">
        {p.enunciado} {p.obrigatoria && <span className="text-red-500">*</span>}
      </Label>
    );
    switch (p.tipo) {
      case "texto_longo":
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <Textarea rows={3} value={(val as string) ?? ""} onChange={(e) => set(p.id, e.target.value)} />
          </div>
        );
      case "sim_nao":
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <div className="flex gap-2">
              {["Sim", "Não"].map((op) => (
                <Button
                  key={op}
                  type="button"
                  variant={val === op ? "default" : "outline"}
                  onClick={() => set(p.id, op)}
                  className={val === op ? "bg-brand-600 hover:bg-brand-700" : ""}
                >
                  {op}
                </Button>
              ))}
            </div>
          </div>
        );
      case "selecao_unica":
      case "multipla_escolha": {
        const opcoes: string[] = Array.isArray(p.opcoes) ? p.opcoes : [];
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <div className="flex flex-wrap gap-2">
              {opcoes.map((op) => {
                const marcado = p.tipo === "multipla_escolha"
                  ? Array.isArray(val) && (val as string[]).includes(op)
                  : val === op;
                return (
                  <Button
                    key={op}
                    type="button"
                    variant={marcado ? "default" : "outline"}
                    size="sm"
                    className={marcado ? "bg-brand-600 hover:bg-brand-700" : ""}
                    onClick={() => {
                      if (p.tipo === "multipla_escolha") {
                        const atual = Array.isArray(val) ? (val as string[]) : [];
                        set(p.id, marcado ? atual.filter((x) => x !== op) : [...atual, op]);
                      } else set(p.id, op);
                    }}
                  >
                    {op}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      }
      case "numero":
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <Input type="number" value={(val as string) ?? ""} onChange={(e) => set(p.id, e.target.value)} />
          </div>
        );
      case "data":
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <Input type="date" value={(val as string) ?? ""} onChange={(e) => set(p.id, e.target.value)} />
          </div>
        );
      default:
        return (
          <div className="space-y-1.5" key={p.id}>
            {label}
            <Input value={(val as string) ?? ""} onChange={(e) => set(p.id, e.target.value)} />
          </div>
        );
    }
  };

  const dadosOk = nome.trim().length >= 5 && celular.replace(/\D/g, "").length >= 10 && !!nascimento;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {carregando ? (
          <div className="py-24 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>
        ) : erro ? (
          <Card className="border-gray-100">
            <CardContent className="p-10 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
              <p className="text-lg font-semibold text-gray-900">Link indisponível</p>
              <p className="text-sm text-gray-500 mt-1">{erro}</p>
            </CardContent>
          </Card>
        ) : pronto ? (
          <Card className="border-gray-100">
            <CardContent className="p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-lg font-semibold text-gray-900">Ficha enviada!</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Obrigado. Suas informações chegaram à {info?.clinica}. Pode fechar esta página.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
                <ClipboardList className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">{info?.modelo}</h1>
              <p className="text-sm text-gray-500">{info?.clinica}</p>
            </div>

            <Card className="border-gray-100 mb-4">
              <CardContent className="p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seus dados</p>
                <div className="space-y-1.5">
                  <Label className="text-sm">Nome completo <span className="text-red-500">*</span></Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como está no documento" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Celular <span className="text-red-500">*</span></Label>
                    <Input
                      value={celular}
                      inputMode="numeric"
                      onChange={(e) => setCelular(formatarCelular(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Data de nascimento <span className="text-red-500">*</span></Label>
                    <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {(info?.perguntas.length ?? 0) > 0 && (
              <Card className="border-gray-100 mb-4">
                <CardContent className="p-5 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questionário</p>
                  {info?.perguntas.map(renderPergunta)}
                </CardContent>
              </Card>
            )}

            <Button
              onClick={enviar}
              disabled={enviando || !dadosOk}
              className="w-full bg-brand-600 hover:bg-brand-700 gap-2"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enviar minha ficha
            </Button>
            {!dadosOk && (
              <p className="text-xs text-gray-400 text-center mt-2">
                Preencha nome, celular e data de nascimento para enviar.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
