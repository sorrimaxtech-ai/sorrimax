import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Sparkles } from 'lucide-react';

const DemoLoader = () => {
  const { enableDemoMode } = useDemoMode();
  const navigate = useNavigate();

  useEffect(() => {
    // Ativar modo demo e redirecionar
    localStorage.setItem('vittalhub_demo_mode', 'true');
    
    // Pequeno delay para efeito visual
    const timer = setTimeout(() => {
      navigate('/dashboard?demo=true');
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-blue-700 text-white">
      <div className="flex bg-white/10 p-4 rounded-2xl backdrop-blur-md mb-6 animate-pulse">
        <Sparkles className="h-12 w-12" />
      </div>
      <h1 className="text-3xl font-bold mb-2">Iniciando Demonstração</h1>
      <p className="text-white/80 animate-pulse">Preparando ambiente com dados fictícios...</p>
      
      <div className="mt-8 w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div className="h-full bg-white animate-progress-bar"></div>
      </div>

      <style>{`
        @keyframes progress-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-progress-bar {
          animation: progress-bar 1.5s linear forwards;
        }
      `}</style>
    </div>
  );
};

export default DemoLoader;
