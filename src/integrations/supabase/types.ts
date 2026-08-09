export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agenda_rotulos: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_rotulos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_rotulos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      anamnese_modelos: {
        Row: {
          clinica_id: string
          created_at: string
          especialidade: string | null
          id: string
          nome: string
          publicado: boolean
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          especialidade?: string | null
          id?: string
          nome: string
          publicado?: boolean
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          especialidade?: string | null
          id?: string
          nome?: string
          publicado?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_modelos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_modelos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      anamnese_perguntas: {
        Row: {
          categoria: string | null
          clinica_id: string
          condicional: Json | null
          created_at: string
          enunciado: string
          escala: Json | null
          id: string
          modelo_id: string
          obrigatoria: boolean
          opcoes: Json | null
          ordem: number
          peso_score: number | null
          tipo: Database["public"]["Enums"]["tipo_pergunta"]
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          clinica_id: string
          condicional?: Json | null
          created_at?: string
          enunciado: string
          escala?: Json | null
          id?: string
          modelo_id: string
          obrigatoria?: boolean
          opcoes?: Json | null
          ordem?: number
          peso_score?: number | null
          tipo?: Database["public"]["Enums"]["tipo_pergunta"]
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          clinica_id?: string
          condicional?: Json | null
          created_at?: string
          enunciado?: string
          escala?: Json | null
          id?: string
          modelo_id?: string
          obrigatoria?: boolean
          opcoes?: Json | null
          ordem?: number
          peso_score?: number | null
          tipo?: Database["public"]["Enums"]["tipo_pergunta"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_perguntas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_perguntas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "anamnese_perguntas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "anamnese_modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_respostas: {
        Row: {
          clinica_id: string
          consulta_id: string | null
          created_at: string
          id: string
          modelo_id: string
          paciente_id: string
          preenchido_por: Database["public"]["Enums"]["preenchido_por"]
          respostas: Json
          score_total: number | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          consulta_id?: string | null
          created_at?: string
          id?: string
          modelo_id: string
          paciente_id: string
          preenchido_por?: Database["public"]["Enums"]["preenchido_por"]
          respostas?: Json
          score_total?: number | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          consulta_id?: string | null
          created_at?: string
          id?: string
          modelo_id?: string
          paciente_id?: string
          preenchido_por?: Database["public"]["Enums"]["preenchido_por"]
          respostas?: Json
          score_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_respostas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_respostas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "anamnese_respostas_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_respostas_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_respostas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "anamnese_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_respostas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_respostas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          clinica_id: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          features_habilitadas: Json | null
          forma_pagamento: string | null
          id: string
          max_pacientes: number | null
          max_profissionais: number | null
          plano: string | null
          status: string | null
          trial_dias_totais: number | null
          trial_dias_usados: number | null
          trial_fim: string | null
          trial_inicio: string | null
          updated_at: string | null
          valor_mensal: number | null
        }
        Insert: {
          clinica_id: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          features_habilitadas?: Json | null
          forma_pagamento?: string | null
          id?: string
          max_pacientes?: number | null
          max_profissionais?: number | null
          plano?: string | null
          status?: string | null
          trial_dias_totais?: number | null
          trial_dias_usados?: number | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          valor_mensal?: number | null
        }
        Update: {
          clinica_id?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          features_habilitadas?: Json | null
          forma_pagamento?: string | null
          id?: string
          max_pacientes?: number | null
          max_profissionais?: number | null
          plano?: string | null
          status?: string | null
          trial_dias_totais?: number | null
          trial_dias_usados?: number | null
          trial_fim?: string | null
          trial_inicio?: string | null
          updated_at?: string | null
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      bloqueios_agenda: {
        Row: {
          clinica_id: string
          created_at: string
          fim: string
          id: string
          inicio: string
          motivo: string | null
          profissional_id: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          profissional_id?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          profissional_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tokens: {
        Row: {
          clinica_id: string
          created_at: string
          expira_em: string
          id: string
          tipo: Database["public"]["Enums"]["tipo_booking_token"]
          token: string
          updated_at: string
          usado_em: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string
          expira_em?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_booking_token"]
          token?: string
          updated_at?: string
          usado_em?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string
          expira_em?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_booking_token"]
          token?: string
          updated_at?: string
          usado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_tokens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tokens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      cadeiras: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string | null
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_financeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      clinica_especialidades: {
        Row: {
          clinica_id: string
          created_at: string | null
          especialidade_id: string
          updated_at: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string | null
          especialidade_id: string
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string | null
          especialidade_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinica_especialidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinica_especialidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "clinica_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicas: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj: string | null
          codigo_clinica: string
          complemento: string | null
          configuracoes: Json | null
          created_at: string | null
          email_clinica: string | null
          endereco: string | null
          estado: string | null
          horario_funcionamento: Json | null
          id: string
          logo_url: string | null
          nome_clinica: string
          numero: string | null
          sistema: boolean
          telefone: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_clinica: string
          complemento?: string | null
          configuracoes?: Json | null
          created_at?: string | null
          email_clinica?: string | null
          endereco?: string | null
          estado?: string | null
          horario_funcionamento?: Json | null
          id?: string
          logo_url?: string | null
          nome_clinica: string
          numero?: string | null
          sistema?: boolean
          telefone?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_clinica?: string
          complemento?: string | null
          configuracoes?: Json | null
          created_at?: string | null
          email_clinica?: string | null
          endereco?: string | null
          estado?: string | null
          horario_funcionamento?: Json | null
          id?: string
          logo_url?: string | null
          nome_clinica?: string
          numero?: string | null
          sistema?: boolean
          telefone?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comissoes: {
        Row: {
          base_calculo: number
          clinica_id: string
          created_at: string
          id: string
          liberada_em: string | null
          orcamento_item_id: string | null
          paga_em: string | null
          parcela_id: string | null
          percentual: number | null
          procedimento_id: string | null
          profissional_id: string
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          base_calculo: number
          clinica_id: string
          created_at?: string
          id?: string
          liberada_em?: string | null
          orcamento_item_id?: string | null
          paga_em?: string | null
          parcela_id?: string | null
          percentual?: number | null
          procedimento_id?: string | null
          profissional_id: string
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          base_calculo?: number
          clinica_id?: string
          created_at?: string
          id?: string
          liberada_em?: string | null
          orcamento_item_id?: string | null
          paga_em?: string | null
          parcela_id?: string | null
          percentual?: number | null
          procedimento_id?: string | null
          profissional_id?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "comissoes_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "lancamento_parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
          {
            foreignKeyName: "comissoes_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_pagamento: {
        Row: {
          aceita_cartao_credito: boolean | null
          aceita_cartao_debito: boolean | null
          aceita_cheque: boolean | null
          aceita_convenio: boolean | null
          aceita_dinheiro: boolean | null
          aceita_parcelamento: boolean | null
          aceita_pix: boolean | null
          aceita_transferencia: boolean | null
          clinica_id: string
          created_at: string | null
          desconto_dinheiro: number | null
          desconto_pix: number | null
          id: string
          max_parcelas: number | null
          taxa_cartao_credito: number | null
          taxa_cartao_debito: number | null
          updated_at: string | null
        }
        Insert: {
          aceita_cartao_credito?: boolean | null
          aceita_cartao_debito?: boolean | null
          aceita_cheque?: boolean | null
          aceita_convenio?: boolean | null
          aceita_dinheiro?: boolean | null
          aceita_parcelamento?: boolean | null
          aceita_pix?: boolean | null
          aceita_transferencia?: boolean | null
          clinica_id: string
          created_at?: string | null
          desconto_dinheiro?: number | null
          desconto_pix?: number | null
          id?: string
          max_parcelas?: number | null
          taxa_cartao_credito?: number | null
          taxa_cartao_debito?: number | null
          updated_at?: string | null
        }
        Update: {
          aceita_cartao_credito?: boolean | null
          aceita_cartao_debito?: boolean | null
          aceita_cheque?: boolean | null
          aceita_convenio?: boolean | null
          aceita_dinheiro?: boolean | null
          aceita_parcelamento?: boolean | null
          aceita_pix?: boolean | null
          aceita_transferencia?: boolean | null
          clinica_id?: string
          created_at?: string | null
          desconto_dinheiro?: number | null
          desconto_pix?: number | null
          id?: string
          max_parcelas?: number | null
          taxa_cartao_credito?: number | null
          taxa_cartao_debito?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_pagamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_pagamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      consulta_rotulos: {
        Row: {
          clinica_id: string
          consulta_id: string
          created_at: string
          rotulo_id: string
        }
        Insert: {
          clinica_id: string
          consulta_id: string
          created_at?: string
          rotulo_id: string
        }
        Update: {
          clinica_id?: string
          consulta_id?: string
          created_at?: string
          rotulo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consulta_rotulos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consulta_rotulos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "consulta_rotulos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consulta_rotulos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consulta_rotulos_rotulo_id_fkey"
            columns: ["rotulo_id"]
            isOneToOne: false
            referencedRelation: "agenda_rotulos"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          cadeira_id: string | null
          cancelado_em: string | null
          checkin_em: string | null
          clinica_id: string
          concluido_em: string | null
          confirmado_em: string | null
          created_at: string
          criado_por: string | null
          desconto: number
          fim: string
          google_event_id: string | null
          id: string
          inicio: string
          lembrete_enviado_em: string | null
          meet_url: string | null
          modalidade: Database["public"]["Enums"]["modalidade_atendimento"]
          motivo_cancelamento: string | null
          observacoes: string | null
          orcamento_id: string | null
          origem: Database["public"]["Enums"]["origem_consulta"]
          paciente_id: string | null
          profissional_id: string
          recorrencia_id: string | null
          servico_id: string | null
          status: Database["public"]["Enums"]["status_consulta"]
          tipo: Database["public"]["Enums"]["tipo_agendamento"]
          titulo: string | null
          total: number | null
          updated_at: string
          valor: number
        }
        Insert: {
          cadeira_id?: string | null
          cancelado_em?: string | null
          checkin_em?: string | null
          clinica_id: string
          concluido_em?: string | null
          confirmado_em?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          fim: string
          google_event_id?: string | null
          id?: string
          inicio: string
          lembrete_enviado_em?: string | null
          meet_url?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_atendimento"]
          motivo_cancelamento?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          origem?: Database["public"]["Enums"]["origem_consulta"]
          paciente_id?: string | null
          profissional_id: string
          recorrencia_id?: string | null
          servico_id?: string | null
          status?: Database["public"]["Enums"]["status_consulta"]
          tipo?: Database["public"]["Enums"]["tipo_agendamento"]
          titulo?: string | null
          total?: number | null
          updated_at?: string
          valor?: number
        }
        Update: {
          cadeira_id?: string | null
          cancelado_em?: string | null
          checkin_em?: string | null
          clinica_id?: string
          concluido_em?: string | null
          confirmado_em?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          fim?: string
          google_event_id?: string | null
          id?: string
          inicio?: string
          lembrete_enviado_em?: string | null
          meet_url?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_atendimento"]
          motivo_cancelamento?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          origem?: Database["public"]["Enums"]["origem_consulta"]
          paciente_id?: string | null
          profissional_id?: string
          recorrencia_id?: string | null
          servico_id?: string | null
          status?: Database["public"]["Enums"]["status_consulta"]
          tipo?: Database["public"]["Enums"]["tipo_agendamento"]
          titulo?: string | null
          total?: number | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultas_cadeira_id_fkey"
            columns: ["cadeira_id"]
            isOneToOne: false
            referencedRelation: "cadeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "consultas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "consultas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      contas_financeiras: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          clinica_id: string
          created_at: string
          id: string
          nome: string
          numero: string | null
          principal: boolean
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["tipo_conta_financeira"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          nome: string
          numero?: string | null
          principal?: boolean
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["tipo_conta_financeira"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          nome?: string
          numero?: string | null
          principal?: boolean
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["tipo_conta_financeira"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_financeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_financeiras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      convenios: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          prazo_repasse_dias: number
          registro_ans: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["tipo_convenio"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          prazo_repasse_dias?: number
          registro_ans?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_convenio"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          prazo_repasse_dias?: number
          registro_ans?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_convenio"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "convenios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convenios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      despesas_fixas: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          clinica_id: string
          conta_id: string | null
          created_at: string
          descricao: string
          dia_vencimento: number
          fim: string | null
          id: string
          inicio: string
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id: string
          conta_id?: string | null
          created_at?: string
          descricao: string
          dia_vencimento: number
          fim?: string | null
          id?: string
          inicio?: string
          updated_at?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id?: string
          conta_id?: string | null
          created_at?: string
          descricao?: string
          dia_vencimento?: number
          fim?: string | null
          id?: string
          inicio?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_fixas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_fixas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_fixas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "despesas_fixas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidades: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_slot_min: number
          modalidades: Database["public"]["Enums"]["modalidade_atendimento"][]
          profissional_id: string
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          intervalo_slot_min?: number
          modalidades?: Database["public"]["Enums"]["modalidade_atendimento"][]
          profissional_id: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_slot_min?: number
          modalidades?: Database["public"]["Enums"]["modalidade_atendimento"][]
          profissional_id?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "disponibilidades_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_modelos: {
        Row: {
          clinica_id: string
          corpo_html: string
          created_at: string
          exibir_assinatura: boolean
          exibir_data_rodape: boolean
          id: string
          nome: string
          sistema: boolean
          tipo: string
          updated_at: string
          variaveis: string[]
        }
        Insert: {
          clinica_id: string
          corpo_html: string
          created_at?: string
          exibir_assinatura?: boolean
          exibir_data_rodape?: boolean
          id?: string
          nome: string
          sistema?: boolean
          tipo?: string
          updated_at?: string
          variaveis?: string[]
        }
        Update: {
          clinica_id?: string
          corpo_html?: string
          created_at?: string
          exibir_assinatura?: boolean
          exibir_data_rodape?: boolean
          id?: string
          nome?: string
          sistema?: boolean
          tipo?: string
          updated_at?: string
          variaveis?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "documento_modelos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_modelos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      documentos_emitidos: {
        Row: {
          clinica_id: string
          consulta_id: string | null
          conteudo_final_html: string
          created_at: string
          emitido_em: string
          emitido_por: string | null
          hash: string | null
          id: string
          modelo_id: string | null
          paciente_id: string
          pdf_url: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          consulta_id?: string | null
          conteudo_final_html: string
          created_at?: string
          emitido_em?: string
          emitido_por?: string | null
          hash?: string | null
          id?: string
          modelo_id?: string | null
          paciente_id: string
          pdf_url?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          consulta_id?: string | null
          conteudo_final_html?: string
          created_at?: string
          emitido_em?: string
          emitido_por?: string | null
          hash?: string | null
          id?: string
          modelo_id?: string | null
          paciente_id?: string
          pdf_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_emitidos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "documentos_emitidos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_emitido_por_fkey"
            columns: ["emitido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "documento_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_emitidos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      enderecos_clinica: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          created_at: string | null
          endereco: string | null
          estado: string | null
          id: string
          numero: string | null
          pais: string | null
          updated_at: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          created_at?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          numero?: string | null
          pais?: string | null
          updated_at?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          created_at?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          numero?: string | null
          pais?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enderecos_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enderecos_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      especialidades: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          clinica_id: string
          consulta_id: string | null
          created_at: string
          created_by: string | null
          custo_unitario: number | null
          id: string
          motivo: string | null
          produto_id: string
          profissional_id: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          updated_at: string
        }
        Insert: {
          clinica_id: string
          consulta_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_unitario?: number | null
          id?: string
          motivo?: string | null
          produto_id: string
          profissional_id?: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          consulta_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_unitario?: number | null
          id?: string
          motivo?: string | null
          produto_id?: string
          profissional_id?: string | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_movimento_estoque"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque_atual"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evolucoes: {
        Row: {
          assinado_em: string | null
          clinica_id: string
          consulta_id: string | null
          conteudo: string
          created_at: string
          dentes: number[]
          hash_assinatura: string | null
          id: string
          paciente_id: string
          profissional_id: string
          retifica_id: string | null
        }
        Insert: {
          assinado_em?: string | null
          clinica_id: string
          consulta_id?: string | null
          conteudo: string
          created_at?: string
          dentes?: number[]
          hash_assinatura?: string | null
          id?: string
          paciente_id: string
          profissional_id: string
          retifica_id?: string | null
        }
        Update: {
          assinado_em?: string | null
          clinica_id?: string
          consulta_id?: string | null
          conteudo?: string
          created_at?: string
          dentes?: number[]
          hash_assinatura?: string | null
          id?: string
          paciente_id?: string
          profissional_id?: string
          retifica_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evolucoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "evolucoes_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "evolucoes_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_retifica_id_fkey"
            columns: ["retifica_id"]
            isOneToOne: false
            referencedRelation: "evolucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up: {
        Row: {
          created_at: string
          id: number
          telefone: number | null
          ultimaAtividade: string | null
          ultimaMensagem: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          telefone?: number | null
          ultimaAtividade?: string | null
          ultimaMensagem?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          telefone?: number | null
          ultimaAtividade?: string | null
          ultimaMensagem?: string | null
        }
        Relationships: []
      }
      lancamento_parcelas: {
        Row: {
          clinica_id: string
          conta_id: string | null
          created_at: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          gateway_id: string | null
          gateway_status: string | null
          id: string
          lancamento_id: string
          link_pagamento: string | null
          numero: number
          pago_em: string | null
          previsao_credito: string | null
          status: Database["public"]["Enums"]["status_parcela"]
          taxa_valor: number
          updated_at: string
          valor: number
          valor_liquido: number | null
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          clinica_id: string
          conta_id?: string | null
          created_at?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          gateway_id?: string | null
          gateway_status?: string | null
          id?: string
          lancamento_id: string
          link_pagamento?: string | null
          numero: number
          pago_em?: string | null
          previsao_credito?: string | null
          status?: Database["public"]["Enums"]["status_parcela"]
          taxa_valor?: number
          updated_at?: string
          valor: number
          valor_liquido?: number | null
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          clinica_id?: string
          conta_id?: string | null
          created_at?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          gateway_id?: string | null
          gateway_status?: string | null
          id?: string
          lancamento_id?: string
          link_pagamento?: string | null
          numero?: number
          pago_em?: string | null
          previsao_credito?: string | null
          status?: Database["public"]["Enums"]["status_parcela"]
          taxa_valor?: number
          updated_at?: string
          valor?: number
          valor_liquido?: number | null
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_parcelas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          categoria_id: string | null
          clinica_id: string
          consulta_id: string | null
          conta_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          observacoes: string | null
          orcamento_id: string | null
          paciente_id: string | null
          profissional_id: string | null
          qtd_parcelas: number
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at: string
          valor_total: number
        }
        Insert: {
          categoria_id?: string | null
          clinica_id: string
          consulta_id?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          profissional_id?: string | null
          qtd_parcelas?: number
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
          valor_total: number
        }
        Update: {
          categoria_id?: string | null
          clinica_id?: string
          consulta_id?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          profissional_id?: string | null
          qtd_parcelas?: number
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "lancamentos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "lancamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          anotacoes: string | null
          clinica_id: string
          created_at: string | null
          email: string | null
          id: string
          nome: string
          origem: string | null
          stage_id: string | null
          status: string | null
          telefone: string
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          anotacoes?: string | null
          clinica_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          origem?: string | null
          stage_id?: string | null
          status?: string | null
          telefone: string
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          anotacoes?: string | null
          clinica_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          origem?: string | null
          stage_id?: string | null
          status?: string | null
          telefone?: string
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_sistema: {
        Row: {
          atendimento_com_ia: string | null
          cpf: number | null
          criado_em: string | null
          data_nascimento: string | null
          email: string | null
          endereco_cep: string | null
          endereco_complemento: string | null
          endereco_estado: string | null
          endereco_gandu: string | null
          endereco_logradouro: string | null
          endereco_numero: number | null
          etiquetas: string | null
          gênero: string | null
          id: number
          id_lead: string | null
          indicações: string | null
          med_alergias: string | null
          med_nome_convenio: string | null
          med_numereo_convenio: number | null
          med_sanguineo: string | null
          nome: string | null
          numero_clinica: number | null
          observacoes: string | null
          origem: string | null
          rg: number | null
          telefone: number | null
        }
        Insert: {
          atendimento_com_ia?: string | null
          cpf?: number | null
          criado_em?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco_cep?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_gandu?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: number | null
          etiquetas?: string | null
          gênero?: string | null
          id?: number
          id_lead?: string | null
          indicações?: string | null
          med_alergias?: string | null
          med_nome_convenio?: string | null
          med_numereo_convenio?: number | null
          med_sanguineo?: string | null
          nome?: string | null
          numero_clinica?: number | null
          observacoes?: string | null
          origem?: string | null
          rg?: number | null
          telefone?: number | null
        }
        Update: {
          atendimento_com_ia?: string | null
          cpf?: number | null
          criado_em?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco_cep?: string | null
          endereco_complemento?: string | null
          endereco_estado?: string | null
          endereco_gandu?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: number | null
          etiquetas?: string | null
          gênero?: string | null
          id?: number
          id_lead?: string | null
          indicações?: string | null
          med_alergias?: string | null
          med_nome_convenio?: string | null
          med_numereo_convenio?: number | null
          med_sanguineo?: string | null
          nome?: string | null
          numero_clinica?: number | null
          observacoes?: string | null
          origem?: string | null
          rg?: number | null
          telefone?: number | null
        }
        Relationships: []
      }
      odontograma_registros: {
        Row: {
          anotacao: string | null
          clinica_id: string
          condicao: string | null
          consulta_id: string | null
          created_at: string
          dente: number | null
          denticao: Database["public"]["Enums"]["dentição"]
          estado: Database["public"]["Enums"]["estado_odontograma"]
          executado_em: string | null
          faces: Database["public"]["Enums"]["face_dental"][]
          id: string
          orcamento_item_id: string | null
          paciente_id: string
          procedimento_id: string | null
          profissional_id: string | null
          regiao: string | null
          regiao_facial: Database["public"]["Enums"]["regiao_facial"] | null
          updated_at: string
        }
        Insert: {
          anotacao?: string | null
          clinica_id: string
          condicao?: string | null
          consulta_id?: string | null
          created_at?: string
          dente?: number | null
          denticao?: Database["public"]["Enums"]["dentição"]
          estado?: Database["public"]["Enums"]["estado_odontograma"]
          executado_em?: string | null
          faces?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          orcamento_item_id?: string | null
          paciente_id: string
          procedimento_id?: string | null
          profissional_id?: string | null
          regiao?: string | null
          regiao_facial?: Database["public"]["Enums"]["regiao_facial"] | null
          updated_at?: string
        }
        Update: {
          anotacao?: string | null
          clinica_id?: string
          condicao?: string | null
          consulta_id?: string | null
          created_at?: string
          dente?: number | null
          denticao?: Database["public"]["Enums"]["dentição"]
          estado?: Database["public"]["Enums"]["estado_odontograma"]
          executado_em?: string | null
          faces?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          orcamento_item_id?: string | null
          paciente_id?: string
          procedimento_id?: string | null
          profissional_id?: string | null
          regiao?: string | null
          regiao_facial?: Database["public"]["Enums"]["regiao_facial"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odontograma_orcamento_item_fk"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "odontograma_registros_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda_dia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "odontograma_registros_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontograma_registros_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
          {
            foreignKeyName: "odontograma_registros_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          clinica_id: string
          created_at: string
          etapa_id: string | null
          ganha_em: string | null
          id: string
          lead_id: string | null
          motivo_perda: string | null
          orcamento_id: string | null
          ordem: number
          origem: Database["public"]["Enums"]["origem_oportunidade"]
          paciente_id: string | null
          perdida_em: string | null
          responsavel_id: string | null
          titulo: string
          updated_at: string
          valor: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          etapa_id?: string | null
          ganha_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_perda?: string | null
          orcamento_id?: string | null
          ordem?: number
          origem: Database["public"]["Enums"]["origem_oportunidade"]
          paciente_id?: string | null
          perdida_em?: string | null
          responsavel_id?: string | null
          titulo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          etapa_id?: string | null
          ganha_em?: string | null
          id?: string
          lead_id?: string | null
          motivo_perda?: string | null
          orcamento_id?: string | null
          ordem?: number
          origem?: Database["public"]["Enums"]["origem_oportunidade"]
          paciente_id?: string | null
          perdida_em?: string | null
          responsavel_id?: string | null
          titulo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_fk"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_lead_fk"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "oportunidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamento_itens: {
        Row: {
          clinica_id: string
          created_at: string
          dente: number | null
          denticao: Database["public"]["Enums"]["dentição"]
          desconto: number
          faces: Database["public"]["Enums"]["face_dental"][]
          id: string
          observacoes: string | null
          orcamento_id: string
          ordem: number
          procedimento_id: string
          quantidade: number
          regiao: string | null
          regiao_facial: Database["public"]["Enums"]["regiao_facial"] | null
          status: Database["public"]["Enums"]["status_item_orcamento"]
          total: number | null
          updated_at: string
          valor_unitario: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          dente?: number | null
          denticao?: Database["public"]["Enums"]["dentição"]
          desconto?: number
          faces?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          observacoes?: string | null
          orcamento_id: string
          ordem?: number
          procedimento_id: string
          quantidade?: number
          regiao?: string | null
          regiao_facial?: Database["public"]["Enums"]["regiao_facial"] | null
          status?: Database["public"]["Enums"]["status_item_orcamento"]
          total?: number | null
          updated_at?: string
          valor_unitario: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          dente?: number | null
          denticao?: Database["public"]["Enums"]["dentição"]
          desconto?: number
          faces?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          observacoes?: string | null
          orcamento_id?: string
          ordem?: number
          procedimento_id?: string
          quantidade?: number
          regiao?: string | null
          regiao_facial?: Database["public"]["Enums"]["regiao_facial"] | null
          status?: Database["public"]["Enums"]["status_item_orcamento"]
          total?: number | null
          updated_at?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          aceite_assinatura_url: string | null
          aceite_ip: unknown
          aceite_token: string | null
          aprovado_em: string | null
          clinica_id: string
          convenio_id: string | null
          created_at: string
          criado_por: string | null
          desconto: number
          id: string
          motivo_reprovacao: string | null
          numero: number
          observacoes: string | null
          paciente_id: string
          profissional_id: string | null
          reprovado_em: string | null
          status: Database["public"]["Enums"]["status_orcamento"]
          titulo: string | null
          total_aprovado: number
          total_itens: number
          updated_at: string
          validade: string | null
        }
        Insert: {
          aceite_assinatura_url?: string | null
          aceite_ip?: unknown
          aceite_token?: string | null
          aprovado_em?: string | null
          clinica_id: string
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          id?: string
          motivo_reprovacao?: string | null
          numero: number
          observacoes?: string | null
          paciente_id: string
          profissional_id?: string | null
          reprovado_em?: string | null
          status?: Database["public"]["Enums"]["status_orcamento"]
          titulo?: string | null
          total_aprovado?: number
          total_itens?: number
          updated_at?: string
          validade?: string | null
        }
        Update: {
          aceite_assinatura_url?: string | null
          aceite_ip?: unknown
          aceite_token?: string | null
          aprovado_em?: string | null
          clinica_id?: string
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          id?: string
          motivo_reprovacao?: string | null
          numero?: number
          observacoes?: string | null
          paciente_id?: string
          profissional_id?: string | null
          reprovado_em?: string | null
          status?: Database["public"]["Enums"]["status_orcamento"]
          titulo?: string | null
          total_aprovado?: number
          total_itens?: number
          updated_at?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "orcamentos_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "orcamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          alergias: string[]
          apelido: string | null
          ativo: boolean
          bairro: string | null
          celular: string
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          convenio_id: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string
          email: string | null
          emergencia_celular: string | null
          emergencia_celular2: string | null
          emergencia_nome: string | null
          emergencia_parentesco: string | null
          estado_civil: string | null
          foto_url: string | null
          genero: string | null
          id: string
          lead_id: string | null
          logradouro: string | null
          nome_completo: string
          numero: string | null
          numero_carteirinha: string | null
          observacoes: string | null
          origem: string
          profissao: string | null
          rg: string | null
          tags: string[]
          uf: string | null
          updated_at: string
        }
        Insert: {
          alergias?: string[]
          apelido?: string | null
          ativo?: boolean
          bairro?: string | null
          celular: string
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          convenio_id?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento: string
          email?: string | null
          emergencia_celular?: string | null
          emergencia_celular2?: string | null
          emergencia_nome?: string | null
          emergencia_parentesco?: string | null
          estado_civil?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          lead_id?: string | null
          logradouro?: string | null
          nome_completo: string
          numero?: string | null
          numero_carteirinha?: string | null
          observacoes?: string | null
          origem?: string
          profissao?: string | null
          rg?: string | null
          tags?: string[]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          alergias?: string[]
          apelido?: string | null
          ativo?: boolean
          bairro?: string | null
          celular?: string
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          convenio_id?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string
          email?: string | null
          emergencia_celular?: string | null
          emergencia_celular2?: string | null
          emergencia_nome?: string | null
          emergencia_parentesco?: string | null
          estado_civil?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          lead_id?: string | null
          logradouro?: string | null
          nome_completo?: string
          numero?: string | null
          numero_carteirinha?: string | null
          observacoes?: string | null
          origem?: string
          profissao?: string | null
          rg?: string | null
          tags?: string[]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "pacientes_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_publico: {
        Row: {
          aceita_agendamento: boolean
          bio: string | null
          capa_url: string | null
          clinica_id: string
          created_at: string
          especialidades: string[]
          foto_url: string | null
          id: string
          publicado: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          aceita_agendamento?: boolean
          bio?: string | null
          capa_url?: string | null
          clinica_id: string
          created_at?: string
          especialidades?: string[]
          foto_url?: string | null
          id?: string
          publicado?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          aceita_agendamento?: boolean
          bio?: string | null
          capa_url?: string | null
          clinica_id?: string
          created_at?: string
          especialidades?: string[]
          foto_url?: string | null
          id?: string
          publicado?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_publico_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_publico_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      perfis_permissao: {
        Row: {
          clinica_id: string
          created_at: string
          id: string
          nome: string
          permissoes: Json
          sistema: boolean
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          id?: string
          nome: string
          permissoes?: Json
          sistema?: boolean
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          id?: string
          nome?: string
          permissoes?: Json
          sistema?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_permissao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_permissao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          clinica_id: string
          cor: string | null
          created_at: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string | null
        }
        Insert: {
          clinica_id: string
          cor?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem: number
          updated_at?: string | null
        }
        Update: {
          clinica_id?: string
          cor?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      procedimento_precos: {
        Row: {
          ativo: boolean
          clinica_id: string
          comissao_percentual: number | null
          comissao_valor: number | null
          convenio_id: string
          created_at: string
          id: string
          procedimento_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          comissao_percentual?: number | null
          comissao_valor?: number | null
          convenio_id: string
          created_at?: string
          id?: string
          procedimento_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          comissao_percentual?: number | null
          comissao_valor?: number | null
          convenio_id?: string
          created_at?: string
          id?: string
          procedimento_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_precos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_precos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "procedimento_precos_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_precos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_precos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      procedimento_profissional: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          duracao_override_min: number | null
          id: string
          procedimento_id: string
          profissional_id: string
          updated_at: string
          valor_override: number | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          duracao_override_min?: number | null
          id?: string
          procedimento_id: string
          profissional_id: string
          updated_at?: string
          valor_override?: number | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          duracao_override_min?: number | null
          id?: string
          procedimento_id?: string
          profissional_id?: string
          updated_at?: string
          valor_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "servico_profissional_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servico_profissional_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "servico_profissional_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servico_profissional_servico_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servico_profissional_servico_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      procedimentos: {
        Row: {
          aplicacao: Database["public"]["Enums"]["aplicacao_procedimento"]
          ativo: boolean
          buffer_antes_min: number
          buffer_depois_min: number
          categoria: string | null
          clinica_id: string
          codigo: string | null
          codigo_tuss: string | null
          cor: string
          created_at: string
          descricao: string | null
          duracao_min: number
          especialidade: string | null
          exige_anamnese: boolean
          exige_prótese: boolean
          faces_padrao: Database["public"]["Enums"]["face_dental"][]
          id: string
          modalidades: Database["public"]["Enums"]["modalidade_atendimento"][]
          nome: string
          publico_no_perfil: boolean
          sessoes_previstas: number
          updated_at: string
          valor: number
        }
        Insert: {
          aplicacao?: Database["public"]["Enums"]["aplicacao_procedimento"]
          ativo?: boolean
          buffer_antes_min?: number
          buffer_depois_min?: number
          categoria?: string | null
          clinica_id: string
          codigo?: string | null
          codigo_tuss?: string | null
          cor?: string
          created_at?: string
          descricao?: string | null
          duracao_min?: number
          especialidade?: string | null
          exige_anamnese?: boolean
          exige_prótese?: boolean
          faces_padrao?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          modalidades?: Database["public"]["Enums"]["modalidade_atendimento"][]
          nome: string
          publico_no_perfil?: boolean
          sessoes_previstas?: number
          updated_at?: string
          valor?: number
        }
        Update: {
          aplicacao?: Database["public"]["Enums"]["aplicacao_procedimento"]
          ativo?: boolean
          buffer_antes_min?: number
          buffer_depois_min?: number
          categoria?: string | null
          clinica_id?: string
          codigo?: string | null
          codigo_tuss?: string | null
          cor?: string
          created_at?: string
          descricao?: string | null
          duracao_min?: number
          especialidade?: string | null
          exige_anamnese?: boolean
          exige_prótese?: boolean
          faces_padrao?: Database["public"]["Enums"]["face_dental"][]
          id?: string
          modalidades?: Database["public"]["Enums"]["modalidade_atendimento"][]
          nome?: string
          publico_no_perfil?: boolean
          sessoes_previstas?: number
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "servicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string | null
          clinica_id: string
          created_at: string
          custo_medio: number | null
          estoque_minimo: number
          id: string
          nome: string
          sku: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          clinica_id: string
          created_at?: string
          custo_medio?: number | null
          estoque_minimo?: number
          id?: string
          nome: string
          sku?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          clinica_id?: string
          created_at?: string
          custo_medio?: number | null
          estoque_minimo?: number
          id?: string
          nome?: string
          sku?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          clinica_id: string | null
          created_at: string | null
          email: string
          especialidade: string | null
          full_name: string | null
          id: string
          registro_profissional: string | null
          role: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          clinica_id?: string | null
          created_at?: string | null
          email: string
          especialidade?: string | null
          full_name?: string | null
          id: string
          registro_profissional?: string | null
          role?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          clinica_id?: string | null
          created_at?: string | null
          email?: string
          especialidade?: string | null
          full_name?: string | null
          id?: string
          registro_profissional?: string | null
          role?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      prontuário: {
        Row: {
          alergia_medicacao: string | null
          antecedentes_familiares: string | null
          apresenta_gravidez: string | null
          como_alimentacao: string | null
          como_higienienizacao: string | null
          cpf: number | null
          created_at: string
          existe_habitos_parafuncionais: string | null
          id: number
          problemas_cicatrizacao: string | null
          qual_habito: string | null
          qual_patologia: string | null
          queixa_principa: string | null
          telefone: number | null
          tem_patologia: string | null
          utilizacao_mediacao: string | null
        }
        Insert: {
          alergia_medicacao?: string | null
          antecedentes_familiares?: string | null
          apresenta_gravidez?: string | null
          como_alimentacao?: string | null
          como_higienienizacao?: string | null
          cpf?: number | null
          created_at?: string
          existe_habitos_parafuncionais?: string | null
          id?: number
          problemas_cicatrizacao?: string | null
          qual_habito?: string | null
          qual_patologia?: string | null
          queixa_principa?: string | null
          telefone?: number | null
          tem_patologia?: string | null
          utilizacao_mediacao?: string | null
        }
        Update: {
          alergia_medicacao?: string | null
          antecedentes_familiares?: string | null
          apresenta_gravidez?: string | null
          como_alimentacao?: string | null
          como_higienienizacao?: string | null
          cpf?: number | null
          created_at?: string
          existe_habitos_parafuncionais?: string | null
          id?: number
          problemas_cicatrizacao?: string | null
          qual_habito?: string | null
          qual_patologia?: string | null
          queixa_principa?: string | null
          telefone?: number | null
          tem_patologia?: string | null
          utilizacao_mediacao?: string | null
        }
        Relationships: []
      }
      protese_servicos: {
        Row: {
          clinica_id: string
          cor: string | null
          created_at: string
          dentes: number[]
          enviado_em: string | null
          etapa: Database["public"]["Enums"]["etapa_protese"]
          id: string
          laboratorio: string | null
          observacoes: string | null
          paciente_id: string
          previsao_retorno: string | null
          retornado_em: string | null
          tipo_peca: string
          updated_at: string
          valor_custo: number | null
        }
        Insert: {
          clinica_id: string
          cor?: string | null
          created_at?: string
          dentes?: number[]
          enviado_em?: string | null
          etapa?: Database["public"]["Enums"]["etapa_protese"]
          id?: string
          laboratorio?: string | null
          observacoes?: string | null
          paciente_id: string
          previsao_retorno?: string | null
          retornado_em?: string | null
          tipo_peca: string
          updated_at?: string
          valor_custo?: number | null
        }
        Update: {
          clinica_id?: string
          cor?: string | null
          created_at?: string
          dentes?: number[]
          enviado_em?: string | null
          etapa?: Database["public"]["Enums"]["etapa_protese"]
          id?: string
          laboratorio?: string | null
          observacoes?: string | null
          paciente_id?: string
          previsao_retorno?: string | null
          retornado_em?: string | null
          tipo_peca?: string
          updated_at?: string
          valor_custo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "protese_servicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protese_servicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "protese_servicos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protese_servicos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      recorrencias: {
        Row: {
          ate: string | null
          clinica_id: string
          created_at: string
          dias_semana: number[]
          id: string
          intervalo: number
          qtd_repeticoes: number | null
          tipo: Database["public"]["Enums"]["tipo_recorrencia"]
          updated_at: string
        }
        Insert: {
          ate?: string | null
          clinica_id: string
          created_at?: string
          dias_semana?: number[]
          id?: string
          intervalo?: number
          qtd_repeticoes?: number | null
          tipo: Database["public"]["Enums"]["tipo_recorrencia"]
          updated_at?: string
        }
        Update: {
          ate?: string | null
          clinica_id?: string
          created_at?: string
          dias_semana?: number[]
          id?: string
          intervalo?: number
          qtd_repeticoes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_recorrencia"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      regioes_faciais: {
        Row: {
          codigo: Database["public"]["Enums"]["regiao_facial"]
          grupo: string
          ordem: number
          rotulo: string
        }
        Insert: {
          codigo: Database["public"]["Enums"]["regiao_facial"]
          grupo: string
          ordem?: number
          rotulo: string
        }
        Update: {
          codigo?: Database["public"]["Enums"]["regiao_facial"]
          grupo?: string
          ordem?: number
          rotulo?: string
        }
        Relationships: []
      }
      taxas_cartao: {
        Row: {
          adquirente: string
          ativo: boolean
          bandeira: string | null
          clinica_id: string
          created_at: string
          id: string
          parcelas_ate: number
          parcelas_de: number
          percentual: number
          prazo_dias: number
          updated_at: string
          valor_fixo: number
        }
        Insert: {
          adquirente: string
          ativo?: boolean
          bandeira?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          parcelas_ate?: number
          parcelas_de?: number
          percentual?: number
          prazo_dias?: number
          updated_at?: string
          valor_fixo?: number
        }
        Update: {
          adquirente?: string
          ativo?: boolean
          bandeira?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          parcelas_ate?: number
          parcelas_de?: number
          percentual?: number
          prazo_dias?: number
          updated_at?: string
          valor_fixo?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxas_cartao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxas_cartao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      whatsapp_chats: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          clinica_id: string
          contact_phone: string | null
          created_at: string | null
          first_response_at: string | null
          id: string
          instance_id: string
          last_from_me: boolean | null
          last_message_content: string | null
          last_message_time: string | null
          last_read_at: string | null
          lead_id: string | null
          name: string | null
          paciente_id: string | null
          profile_pic_url: string | null
          remote_jid: string
          status: string | null
          tags: string[]
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          clinica_id: string
          contact_phone?: string | null
          created_at?: string | null
          first_response_at?: string | null
          id?: string
          instance_id: string
          last_from_me?: boolean | null
          last_message_content?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          lead_id?: string | null
          name?: string | null
          paciente_id?: string | null
          profile_pic_url?: string | null
          remote_jid: string
          status?: string | null
          tags?: string[]
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          clinica_id?: string
          contact_phone?: string | null
          created_at?: string | null
          first_response_at?: string | null
          id?: string
          instance_id?: string
          last_from_me?: boolean | null
          last_message_content?: string | null
          last_message_time?: string | null
          last_read_at?: string | null
          lead_id?: string | null
          name?: string | null
          paciente_id?: string | null
          profile_pic_url?: string | null
          remote_jid?: string
          status?: string | null
          tags?: string[]
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chats_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "whatsapp_chats_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      whatsapp_instance_eventos: {
        Row: {
          acao: Database["public"]["Enums"]["acao_instancia"]
          ator: string | null
          clinica_id: string
          created_at: string
          detalhe: string | null
          id: string
          instancia_id: string | null
          nome: string | null
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_instancia"]
          ator?: string | null
          clinica_id: string
          created_at?: string
          detalhe?: string | null
          id?: string
          instancia_id?: string | null
          nome?: string | null
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_instancia"]
          ator?: string | null
          clinica_id?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          instancia_id?: string | null
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_eventos_ator_fkey"
            columns: ["ator"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instance_eventos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instance_eventos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_token: string | null
          api_url: string | null
          apikey: string | null
          clinica_id: string
          connected_at: string | null
          created_at: string | null
          degraded: boolean
          external_ref: string | null
          external_system: string | null
          id: string
          instance_id: string
          last_seen_at: string | null
          name: string
          owner_number: string | null
          profile_name: string | null
          provider: Database["public"]["Enums"]["wa_provider"]
          qrcode: string | null
          shared_external: boolean
          status: string | null
          updated_at: string | null
          webhook_mode: string
          webhook_secret: string | null
        }
        Insert: {
          api_token?: string | null
          api_url?: string | null
          apikey?: string | null
          clinica_id: string
          connected_at?: string | null
          created_at?: string | null
          degraded?: boolean
          external_ref?: string | null
          external_system?: string | null
          id?: string
          instance_id: string
          last_seen_at?: string | null
          name: string
          owner_number?: string | null
          profile_name?: string | null
          provider?: Database["public"]["Enums"]["wa_provider"]
          qrcode?: string | null
          shared_external?: boolean
          status?: string | null
          updated_at?: string | null
          webhook_mode?: string
          webhook_secret?: string | null
        }
        Update: {
          api_token?: string | null
          api_url?: string | null
          apikey?: string | null
          clinica_id?: string
          connected_at?: string | null
          created_at?: string | null
          degraded?: boolean
          external_ref?: string | null
          external_system?: string | null
          id?: string
          instance_id?: string
          last_seen_at?: string | null
          name?: string
          owner_number?: string | null
          profile_name?: string | null
          provider?: Database["public"]["Enums"]["wa_provider"]
          qrcode?: string | null
          shared_external?: boolean
          status?: string | null
          updated_at?: string | null
          webhook_mode?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          chat_id: string
          clinica_id: string
          content: string | null
          created_at: string | null
          delivered_at: string | null
          external_id: string | null
          failed_reason: string | null
          file_name: string | null
          from_me: boolean | null
          id: string
          media_type: string | null
          media_url: string | null
          message_type: Database["public"]["Enums"]["wa_msg_type"]
          metadata: Json
          mime_type: string | null
          read_at: string | null
          reply_to: string | null
          sender_name: string | null
          sent_at: string | null
          seqid: number | null
          status: Database["public"]["Enums"]["wa_msg_status"] | null
          updated_at: string | null
        }
        Insert: {
          chat_id: string
          clinica_id: string
          content?: string | null
          created_at?: string | null
          delivered_at?: string | null
          external_id?: string | null
          failed_reason?: string | null
          file_name?: string | null
          from_me?: boolean | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["wa_msg_type"]
          metadata?: Json
          mime_type?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_name?: string | null
          sent_at?: string | null
          seqid?: number | null
          status?: Database["public"]["Enums"]["wa_msg_status"] | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: string
          clinica_id?: string
          content?: string | null
          created_at?: string | null
          delivered_at?: string | null
          external_id?: string | null
          failed_reason?: string | null
          file_name?: string | null
          from_me?: boolean | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["wa_msg_type"]
          metadata?: Json
          mime_type?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_name?: string | null
          sent_at?: string | null
          seqid?: number | null
          status?: Database["public"]["Enums"]["wa_msg_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          chat_id: string | null
          clinica_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          instance_id: string
          kind: Database["public"]["Enums"]["wa_msg_type"]
          last_error: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string
          payload: Json
          scheduled_at: string
          status: Database["public"]["Enums"]["wa_outbox_status"]
          to_number: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          chat_id?: string | null
          clinica_id: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          instance_id: string
          kind?: Database["public"]["Enums"]["wa_msg_type"]
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          payload: Json
          scheduled_at?: string
          status?: Database["public"]["Enums"]["wa_outbox_status"]
          to_number: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          chat_id?: string | null
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          instance_id?: string
          kind?: Database["public"]["Enums"]["wa_msg_type"]
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          payload?: Json
          scheduled_at?: string
          status?: Database["public"]["Enums"]["wa_outbox_status"]
          to_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_agenda_dia: {
        Row: {
          cadeira_cor: string | null
          cadeira_id: string | null
          cadeira_nome: string | null
          clinica_id: string | null
          fim: string | null
          id: string | null
          inicio: string | null
          modalidade:
            | Database["public"]["Enums"]["modalidade_atendimento"]
            | null
          observacoes: string | null
          orcamento_id: string | null
          paciente_celular: string | null
          paciente_id: string | null
          paciente_nome: string | null
          procedimento_cor: string | null
          procedimento_nome: string | null
          profissional_id: string | null
          profissional_nome: string | null
          rotulos: Json | null
          servico_id: string | null
          status: Database["public"]["Enums"]["status_consulta"] | null
          tipo: Database["public"]["Enums"]["tipo_agendamento"] | null
          titulo: string | null
          venda_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultas_cadeira_id_fkey"
            columns: ["cadeira_id"]
            isOneToOne: false
            referencedRelation: "cadeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "consultas_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_pacientes_inativos"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "consultas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_procedimento"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      vw_comissoes_profissional: {
        Row: {
          clinica_id: string | null
          liberada: number | null
          mes: string | null
          paga: number | null
          prevista: number | null
          profissional: string | null
          profissional_id: string | null
          qtd: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "comissoes_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dashboard_kpis: {
        Row: {
          a_receber_mes: number | null
          aniversariantes_30d: number | null
          clinica_id: string | null
          debitos_em_atraso: number | null
          orcamentos_nao_fechados: number | null
          recebido_mes: number | null
        }
        Insert: {
          a_receber_mes?: never
          aniversariantes_30d?: never
          clinica_id?: string | null
          debitos_em_atraso?: never
          orcamentos_nao_fechados?: never
          recebido_mes?: never
        }
        Update: {
          a_receber_mes?: never
          aniversariantes_30d?: never
          clinica_id?: string | null
          debitos_em_atraso?: never
          orcamentos_nao_fechados?: never
          recebido_mes?: never
        }
        Relationships: []
      }
      vw_estoque_atual: {
        Row: {
          alerta_estoque_baixo: boolean | null
          ativo: boolean | null
          categoria: string | null
          clinica_id: string | null
          custo_medio: number | null
          estoque_minimo: number | null
          nome: string | null
          produto_id: string | null
          saldo: number | null
          sku: string | null
          ultima_movimentacao: string | null
          unidade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_faturamento_procedimento: {
        Row: {
          clinica_id: string | null
          especialidade: string | null
          mes: string | null
          procedimento: string | null
          procedimento_id: string | null
          qtd: number | null
          ticket_medio: number | null
          valor_aprovado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_fluxo_caixa_mensal: {
        Row: {
          clinica_id: string | null
          em_aberto: number | null
          liquido: number | null
          mes: string | null
          previsto: number | null
          realizado: number | null
          taxas: number | null
          tipo: Database["public"]["Enums"]["tipo_lancamento"] | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_parcelas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_funil_completo: {
        Row: {
          clinica_id: string | null
          com_orcamento: number | null
          com_orcamento_aprovado: number | null
          com_tratamento_concluido: number | null
          mes: string | null
          origem: string | null
          pacientes: number | null
          taxa_aprovacao_pct: number | null
          taxa_recebimento_pct: number | null
          valor_aprovado: number | null
          valor_orcado: number | null
          valor_recebido: number | null
          vindos_do_crm: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_ocupacao_agenda: {
        Row: {
          cadeira_id: string | null
          canceladas: number | null
          clinica_id: string | null
          concluidas: number | null
          horas_agendadas: number | null
          mes: string | null
          no_show: number | null
          profissional_id: string | null
          taxa_no_show_pct: number | null
          total_consultas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultas_cadeira_id_fkey"
            columns: ["cadeira_id"]
            isOneToOne: false
            referencedRelation: "cadeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "consultas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pacientes_inativos: {
        Row: {
          celular: string | null
          clinica_id: string | null
          dias_sem_vir: number | null
          nome_completo: string | null
          paciente_id: string | null
          tem_tratamento_pendente: boolean | null
          ultima_consulta: string | null
          valor_em_aberto: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_dashboard_kpis"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
    }
    Functions: {
      apply_tenant_rls: { Args: { p_table: string }; Returns: undefined }
      auditoria_guard_null: {
        Args: never
        Returns: {
          fn: string
        }[]
      }
      auditoria_saude: {
        Args: never
        Returns: {
          categoria: string
          detalhe: string
          item: string
          status: string
        }[]
      }
      can_add_professional: { Args: { p_clinica_id: string }; Returns: boolean }
      consulta_lancar_venda: {
        Args: { p_consulta_id: string; p_itens: Json }
        Returns: string
      }
      consulta_ocupa_agenda: {
        Args: { s: Database["public"]["Enums"]["status_consulta"] }
        Returns: boolean
      }
      create_clinic_and_link_admin:
        | {
            Args: {
              p_email_clinica: string
              p_nome_admin: string
              p_nome_clinica: string
              p_telefone: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_email_clinica: string
              p_nome_admin: string
              p_nome_clinica: string
              p_senha_admin: string
              p_telefone: string
            }
            Returns: Json
          }
      criar_clinica_para_usuario: {
        Args: { p_email?: string; p_nome_clinica: string; p_telefone?: string }
        Returns: string
      }
      current_clinica_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      generate_clinic_code: { Args: never; Returns: string }
      gerar_debitos_orcamento: {
        Args: {
          p_conta_id?: string
          p_forma: Database["public"]["Enums"]["forma_pagamento"]
          p_orcamento_id: string
          p_primeiro_venc?: string
          p_qtd_parcelas?: number
        }
        Returns: string
      }
      get_auth_user_clinic_id: { Args: never; Returns: string }
      get_auth_user_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_subscription_active: {
        Args: { p_clinica_id: string }
        Returns: boolean
      }
      marcar_parcelas_atrasadas: { Args: never; Returns: number }
      meu_contexto: {
        Args: never
        Returns: {
          clinica_codigo: string
          clinica_id: string
          clinica_nome: string
          email: string
          nome: string
          role: string
          user_id: string
        }[]
      }
      seed_anamnese_odonto: { Args: { p_clinica: string }; Returns: string }
      seed_documentos_clinica: {
        Args: { p_clinica: string }
        Returns: undefined
      }
      seed_perfis_permissao: { Args: { p_clinica: string }; Returns: undefined }
      semear_rotulos_agenda: {
        Args: { p_clinica_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slots_disponiveis: {
        Args: {
          p_data: string
          p_profissional_id: string
          p_servico_id?: string
        }
        Returns: {
          fim: string
          inicio: string
        }[]
      }
      trial_dias_restantes: { Args: { assinatura_id: string }; Returns: number }
      wa_enfileirar_texto: {
        Args: { p_chat_id: string; p_scheduled_at?: string; p_texto: string }
        Returns: string
      }
      wa_ingerir_eco: {
        Args: { p_chat_id: string; p_external_id: string }
        Returns: string
      }
      wa_instancia_gerenciavel: { Args: { p_id: string }; Returns: boolean }
      wa_marcar_chat_lido: { Args: { p_chat_id: string }; Returns: undefined }
      wa_outbox_claim: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          chat_id: string | null
          clinica_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          instance_id: string
          kind: Database["public"]["Enums"]["wa_msg_type"]
          last_error: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string
          payload: Json
          scheduled_at: string
          status: Database["public"]["Enums"]["wa_outbox_status"]
          to_number: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wa_outbox_reaper: { Args: { p_lease_seconds?: number }; Returns: number }
      wa_status_rank: {
        Args: { s: Database["public"]["Enums"]["wa_msg_status"] }
        Returns: number
      }
    }
    Enums: {
      acao_instancia:
        | "criada"
        | "conectada"
        | "qr_gerado"
        | "desconectada"
        | "excluida"
        | "sincronizada"
        | "falha"
      aplicacao_procedimento:
        | "dente"
        | "face"
        | "quadrante"
        | "arcada"
        | "boca"
        | "regiao"
        | "sem_dente"
      dentição: "permanente" | "decidua"
      estado_odontograma:
        | "planejado"
        | "em_execucao"
        | "finalizado"
        | "condicao"
      etapa_protese:
        | "pre_laboratorio"
        | "envio"
        | "laboratorio"
        | "prova"
        | "agenda"
        | "realizado"
      face_dental:
        | "mesial"
        | "distal"
        | "vestibular"
        | "lingual"
        | "palatina"
        | "oclusal"
        | "incisal"
        | "cervical"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "debito"
        | "credito"
        | "boleto"
        | "transferencia"
        | "cheque"
        | "convenio"
        | "financiamento"
        | "cortesia"
      modalidade_atendimento: "presencial" | "online" | "domiciliar"
      origem_consulta:
        | "interno"
        | "booking_publico"
        | "whatsapp"
        | "crm"
        | "importacao"
      origem_oportunidade: "lead" | "orcamento" | "manual" | "indicacao"
      preenchido_por: "profissional" | "paciente"
      regiao_facial:
        | "testa"
        | "glabela"
        | "temporal"
        | "periorbital"
        | "olheira"
        | "supercilio"
        | "nariz"
        | "dorso_nasal"
        | "malar"
        | "zigomatico"
        | "sulco_nasogeniano"
        | "labio_superior"
        | "labio_inferior"
        | "codigo_barras"
        | "mento"
        | "sulco_labiomentual"
        | "mandibula"
        | "papada"
        | "pescoco"
        | "bichectomia"
        | "masseter"
        | "arco_zigomatico"
      status_consulta:
        | "pendente"
        | "agendado"
        | "confirmado"
        | "em_atendimento"
        | "concluido"
        | "reagendado"
        | "desmarcado"
        | "recusado"
        | "nao_compareceu"
        | "cancelado"
        | "cancelado_pelo_cliente"
      status_item_orcamento: "pendente" | "aprovado" | "recusado"
      status_orcamento:
        | "rascunho"
        | "aberto"
        | "aprovado_parcial"
        | "aprovado"
        | "reprovado"
        | "expirado"
        | "cancelado"
      status_parcela:
        | "pendente"
        | "pago"
        | "atrasado"
        | "cancelado"
        | "estornado"
      tipo_agendamento: "consulta" | "compromisso"
      tipo_booking_token: "cadastro" | "agendamento"
      tipo_conta_financeira: "caixa" | "banco" | "carteira_digital"
      tipo_convenio: "particular" | "convenio"
      tipo_lancamento: "receber" | "pagar"
      tipo_movimento_estoque: "entrada" | "saida" | "ajuste" | "perda"
      tipo_pergunta:
        | "texto"
        | "texto_longo"
        | "numero"
        | "data"
        | "sim_nao"
        | "selecao_unica"
        | "multipla_escolha"
        | "escala"
        | "upload"
        | "assinatura"
        | "secao"
      tipo_pessoa: "fisica" | "juridica"
      tipo_recorrencia:
        | "diaria"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "trimestral"
        | "semestral"
        | "anual"
      wa_msg_status:
        | "pending"
        | "sent"
        | "delivered"
        | "read"
        | "played"
        | "failed"
      wa_msg_type:
        | "text"
        | "image"
        | "video"
        | "audio"
        | "ptt"
        | "document"
        | "location"
        | "contact"
        | "reaction"
        | "sticker"
        | "call"
        | "system"
        | "unknown"
      wa_outbox_status:
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "dead"
        | "canceled"
      wa_provider: "uazapi" | "evolution" | "meta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acao_instancia: [
        "criada",
        "conectada",
        "qr_gerado",
        "desconectada",
        "excluida",
        "sincronizada",
        "falha",
      ],
      aplicacao_procedimento: [
        "dente",
        "face",
        "quadrante",
        "arcada",
        "boca",
        "regiao",
        "sem_dente",
      ],
      dentição: ["permanente", "decidua"],
      estado_odontograma: [
        "planejado",
        "em_execucao",
        "finalizado",
        "condicao",
      ],
      etapa_protese: [
        "pre_laboratorio",
        "envio",
        "laboratorio",
        "prova",
        "agenda",
        "realizado",
      ],
      face_dental: [
        "mesial",
        "distal",
        "vestibular",
        "lingual",
        "palatina",
        "oclusal",
        "incisal",
        "cervical",
      ],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "debito",
        "credito",
        "boleto",
        "transferencia",
        "cheque",
        "convenio",
        "financiamento",
        "cortesia",
      ],
      modalidade_atendimento: ["presencial", "online", "domiciliar"],
      origem_consulta: [
        "interno",
        "booking_publico",
        "whatsapp",
        "crm",
        "importacao",
      ],
      origem_oportunidade: ["lead", "orcamento", "manual", "indicacao"],
      preenchido_por: ["profissional", "paciente"],
      regiao_facial: [
        "testa",
        "glabela",
        "temporal",
        "periorbital",
        "olheira",
        "supercilio",
        "nariz",
        "dorso_nasal",
        "malar",
        "zigomatico",
        "sulco_nasogeniano",
        "labio_superior",
        "labio_inferior",
        "codigo_barras",
        "mento",
        "sulco_labiomentual",
        "mandibula",
        "papada",
        "pescoco",
        "bichectomia",
        "masseter",
        "arco_zigomatico",
      ],
      status_consulta: [
        "pendente",
        "agendado",
        "confirmado",
        "em_atendimento",
        "concluido",
        "reagendado",
        "desmarcado",
        "recusado",
        "nao_compareceu",
        "cancelado",
        "cancelado_pelo_cliente",
      ],
      status_item_orcamento: ["pendente", "aprovado", "recusado"],
      status_orcamento: [
        "rascunho",
        "aberto",
        "aprovado_parcial",
        "aprovado",
        "reprovado",
        "expirado",
        "cancelado",
      ],
      status_parcela: [
        "pendente",
        "pago",
        "atrasado",
        "cancelado",
        "estornado",
      ],
      tipo_agendamento: ["consulta", "compromisso"],
      tipo_booking_token: ["cadastro", "agendamento"],
      tipo_conta_financeira: ["caixa", "banco", "carteira_digital"],
      tipo_convenio: ["particular", "convenio"],
      tipo_lancamento: ["receber", "pagar"],
      tipo_movimento_estoque: ["entrada", "saida", "ajuste", "perda"],
      tipo_pergunta: [
        "texto",
        "texto_longo",
        "numero",
        "data",
        "sim_nao",
        "selecao_unica",
        "multipla_escolha",
        "escala",
        "upload",
        "assinatura",
        "secao",
      ],
      tipo_pessoa: ["fisica", "juridica"],
      tipo_recorrencia: [
        "diaria",
        "semanal",
        "quinzenal",
        "mensal",
        "trimestral",
        "semestral",
        "anual",
      ],
      wa_msg_status: [
        "pending",
        "sent",
        "delivered",
        "read",
        "played",
        "failed",
      ],
      wa_msg_type: [
        "text",
        "image",
        "video",
        "audio",
        "ptt",
        "document",
        "location",
        "contact",
        "reaction",
        "sticker",
        "call",
        "system",
        "unknown",
      ],
      wa_outbox_status: [
        "queued",
        "sending",
        "sent",
        "failed",
        "dead",
        "canceled",
      ],
      wa_provider: ["uazapi", "evolution", "meta"],
    },
  },
} as const
