import { Button } from "@/components/ui/button";
import { QrCode, RefreshCw, CheckCircle2, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { EvolutionService } from "@/services/evolution";
import { toast } from "sonner";

export const WhatsAppConnect = () => {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);

  useEffect(() => {
    // 1. Get Clinic ID to define Instance Name
    const session = localStorage.getItem("user_session");
    if (session) {
        const { clinica_id } = JSON.parse(session);
        const name = `clinic_${clinica_id}`; // Unique instance per clinic
        setInstanceName(name);
        checkConnection(name);
    }
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (instanceName && status !== "connected") {
        // Poll every 3 seconds to check if user scanned the code
        intervalId = setInterval(() => {
            checkConnection(instanceName);
        }, 3000);
    }

    return () => {
        if (intervalId) clearInterval(intervalId);
    };
  }, [instanceName, status]);

  const checkConnection = async (name: string) => {
    try {
        const state = await EvolutionService.fetchInstanceStatus(name);
        // Only update if state changes to avoid re-renders or loops if logic was complex
        if (state === "connected") {
            setStatus("connected");
            setQrCode(null);
            toast.success("WhatsApp conectado!");
        }
    } catch (error) {
        // Keep waiting if error (could be temporary network glitch or instance not ready)
    }
  };

  const handleConnect = async () => {
    if (!instanceName) {
        toast.error("Erro: ID da clínica não encontrado");
        return;
    }

    setStatus("connecting");
    setQrCode(null);

    try {
        const data = await EvolutionService.createInstance(instanceName);
        
        if (data?.qrcode?.base64) {
            setQrCode(data.qrcode.base64);
        } else if (data?.base64) {
             setQrCode(data.base64);
        } else {
             // Fallback: try connecting existing instance
             const connectData = await EvolutionService.connectInstance(instanceName);
             if (connectData?.base64) setQrCode(connectData.base64);
        }

    } catch (error) {
        console.error(error);
        toast.error("Erro ao conectar. Verifique se a VPS está online.");
        setStatus("disconnected");
    }
  };

  const handleDisconnect = async () => {
    if (!instanceName) return;

    try {
        await EvolutionService.deleteInstance(instanceName);
        setStatus("disconnected");
        setQrCode(null);
        toast.success("Desconectado com sucesso");
    } catch (error) {
        toast.error("Erro ao desconectar");
    }
  };



  return (
    <div className="bg-white p-6 rounded-xl border border-border shadow-sm max-w-md mx-auto mt-10">
      <div className="flex justify-between items-start mb-6">
        <div>
            <h2 className="text-xl font-bold text-gray-900">WhatsApp da Clínica</h2>
            <p className="text-sm text-gray-500">Conecte seu número oficial</p>
        </div>
        <div className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-500">
            {instanceName || "Carregando..."}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-gray-200 rounded-xl bg-slate-50/50 p-6 relative">
        {status === "disconnected" && (
          <div className="text-center">
            <QrCode className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <Button onClick={handleConnect} className="bg-green-600 hover:bg-green-700" disabled={status === 'connecting' || !instanceName}>
               {status === 'connecting' ? 'Gerando QR...' : 'Conectar WhatsApp'}
            </Button>
          </div>
        )}

        {status === "connecting" && qrCode && (
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-2 rounded-lg shadow-sm mb-4 inline-block">
               <img src={qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-gray-500 animate-pulse">Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar</p>
            <Button variant="link" size="sm" className="mt-2 text-gray-400" onClick={() => setStatus("disconnected")}>Cancelar</Button>
          </div>
        )}
        
        {status === "connecting" && !qrCode && (
             <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin" />
                <p className="text-sm text-gray-500">Iniciando sessão na VPS...</p>
             </div>
        )}

        {status === "connected" && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-5 duration-500">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-green-700 text-lg">Online!</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Seu WhatsApp está sincronizado.</p>
            <Button 
                variant="outline" 
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 gap-2"
                onClick={handleDisconnect}
            >
                <LogOut className="h-4 w-4" />
                Desconectar Sessão
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
