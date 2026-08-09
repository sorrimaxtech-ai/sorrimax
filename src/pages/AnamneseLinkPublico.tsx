import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertTriangle, ClipboardList } from "lucide-react";
import { formatarCelular } from "@/services/pacientes";

// ============================================================================
// /p/:token — preenchimento público de anamnese (paciente, sem login)
// ----------------------------------------------------------------------------
// O link é gerado na página de Pacientes. Tudo passa pelas RPCs
// anamnese_link_info / anamnese_link_responder (migration 0043): o anon nunca
// lê tabela — só um token válido, não usado e não expirado abre o formulário.
// ============================================================================

interface Pergunta {
  id: string;
  enunciado: string;
  categoria: string | null;
  tipo: string;
  obrigatoria: boolean;
  opcoes: any;
  escala: any;
  ordem: number;
}

const AnamneseLinkPublico = () => {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] =