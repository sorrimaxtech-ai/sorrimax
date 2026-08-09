import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const DEMO_MODE_KEY = 'sorrimax_demo_mode';

// ============================================================================
// Modo demo — vitrine pública, JAMAIS por cima de uma sessão real
// ----------------------------------------------------------------------------
// O flag mora em localStorage (sticky). O bug: quem clicou "Ver demo" uma vez
// carregava o flag pra sempre — e ao logar na conta REAL, no mesmo navegador,
// via `demoConsultas` no lugar do dado dele ("quero ver todas as interações da
// minha conta"). Aqui uma sessão autenticada SEMPRE vence: zera o flag e desliga
// a demo. A vitrine continua valendo só pra visitante deslogado.
// ============================================================================

export const useDemoMode = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [demoFlag, setDemoFlag] = useState(() => {
    const stored = localStorage.getItem(DEMO_MODE_KEY) === 'true';
    const url = new URLSearchParams(window.location.search);
    return url.get('demo') === 'true' || stored;
  });
  // null = ainda checando a sessão; true/false = tem/não tem sessão real
  const [temSessao, setTemSessao] = useState<boolean | null>(null);

  // sincroniza o flag com URL/localStorage nas trocas de rota
  useEffect(() => {
    const url = new URLSearchParams(location.search);
    const demoParam = url.get('demo') === 'true';
    const stored = localStorage.getItem(DEMO_MODE_KEY) === 'true';
    if (demoParam || stored) {
      setDemoFlag(true);
      if (!stored) localStorage.setItem(DEMO_MODE_KEY, 'true');
    }
  }, [location]);

  // sessão real vence a demo — e some com o flag, pra vitrine nunca contaminar
  // o dado de quem logou.
  useEffect(() => {
    let vivo = true;
    const aplicar = (temSessaoAgora: boolean) => {
      setTemSessao(temSessaoAgora);
      if (temSessaoAgora) {
        localStorage.removeItem(DEMO_MODE_KEY);
        setDemoFlag(false);
      }
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (vivo) aplicar(!!session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      aplicar(!!session);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const enableDemoMode = () => {
    localStorage.setItem(DEMO_MODE_KEY, 'true');
    setDemoFlag(true);
    navigate('/dashboard?demo=true');
  };

  const disableDemoMode = () => {
    localStorage.removeItem(DEMO_MODE_KEY);
    setDemoFlag(false);
    navigate('/');
  };

  // demo só vale enquanto NÃO há sessão real confirmada (pendente mantém a demo
  // pro visitante não piscar; sessão confirmada a desliga).
  const isDemo = demoFlag && temSessao !== true;

  return { isDemo, enableDemoMode, disableDemoMode };
};
