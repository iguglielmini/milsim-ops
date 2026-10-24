// API da conta: missões, privacidade, suporte, notificações, aparência e preferências.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as conta from "@/services/conta";
import { definirSilencio as silencio } from "@/services/notificacoes";
import { exigirUsuario, mutar } from "@/server/unidade.server";
import { chamar } from "@/api/cliente";
import type { PreferenciaModalidades } from "@/lib/modalidades";
import type { SolicitacaoPrivacidade } from "@/lib/domain/types";
import type { DadosChamado, DadosConta } from "@/services/conta";
import type { Tema } from "@/lib/localizacao";
import { esquemaFicha, type DadosFicha } from "@/lib/fichaEmergencia";

const id = z.string().min(1).max(100);

export const enviarEntregaMissaoFn = createServerFn({ method: "POST" })
  .validator(z.object({ missaoId: id, texto: z.string().max(4000).optional() }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.enviarEntregaMissao(exigirUsuario(usuario), data.missaoId, data.texto)));

export const solicitarPrivacidadeFn = createServerFn({ method: "POST" })
  .validator(z.object({ tipo: z.enum(["acesso", "correcao", "exportacao", "exclusao"]), detalhes: z.string().max(4000) }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.solicitarPrivacidade(exigirUsuario(usuario), data.tipo, data.detalhes)));

export const abrirChamadoFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ assunto: z.string().max(200), categoria: z.string().max(60), descricao: z.string().max(4000), eventoId: z.string().max(100).optional() }).parse,
  )
  .handler(({ data }) => mutar(({ usuario }) => conta.abrirChamado(exigirUsuario(usuario), data)));

export const responderChamadoFn = createServerFn({ method: "POST" })
  .validator(z.object({ chamadoId: id, corpo: z.string().max(4000) }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.responderChamado(exigirUsuario(usuario), data.chamadoId, data.corpo)));

export const marcarNotificacaoLidaFn = createServerFn({ method: "POST" })
  .validator(z.object({ id }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.marcarNotificacaoLida(exigirUsuario(usuario), data.id)));

export const marcarNotificacoesLidasFn = createServerFn({ method: "POST" })
  .validator(z.object({ plataforma: z.boolean() }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.marcarNotificacoesLidas(exigirUsuario(usuario), data.plataforma)));

export const definirSilencioFn = createServerFn({ method: "POST" })
  .validator(z.object({ todas: z.boolean().optional(), comunidade: z.boolean().optional() }).parse)
  .handler(({ data }) => mutar(({ usuario }) => silencio(exigirUsuario(usuario).id, data)));

export const definirFotoFn = createServerFn({ method: "POST" })
  .validator(z.object({ foto: z.string().max(conta.TAMANHO_MAXIMO_FOTO).nullable() }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.definirFoto(exigirUsuario(usuario), data.foto)));

export const definirTemaFn = createServerFn({ method: "POST" })
  .validator(z.object({ tema: z.enum(["dark", "light"]) }).parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.definirTema(exigirUsuario(usuario), data.tema)));

export const salvarPreferenciaFn = createServerFn({ method: "POST" })
  .validator(z.object({ estado: z.enum(["pendente", "todas", "selecionadas"]), modalidades: z.array(z.string().max(40)).max(20) }).passthrough().parse)
  .handler(({ data }) =>
    mutar(({ usuario }) => conta.salvarPreferenciaModalidades(exigirUsuario(usuario), data as unknown as PreferenciaModalidades)),
  );

/** Ficha de emergência da própria conta (opcional; vazio remove). */
export const salvarFichaEmergenciaFn = createServerFn({ method: "POST" })
  .validator(esquemaFicha.parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.salvarFichaEmergencia(exigirUsuario(usuario), data)));

/** Dados da própria conta (CPF e e-mail não mudam por aqui). */
const texto = (max: number) => z.string().max(max);
export const atualizarDadosContaFn = createServerFn({ method: "POST" })
  .validator(z.object({
    nomeCompleto: texto(150), dataNascimento: texto(10), whatsapp: texto(20),
    cep: texto(9), logradouro: texto(150), numero: texto(20), complemento: texto(100).optional(),
    bairro: texto(100), cidade: texto(100), uf: texto(2),
    instagram: texto(60).optional(), squad: texto(80).optional(),
  }).strict().parse)
  .handler(({ data }) => mutar(({ usuario }) => conta.atualizarDadosConta(exigirUsuario(usuario), data)));

// ---------- Uso no navegador ----------
export const atualizarDadosConta = (dados: DadosConta) => chamar(atualizarDadosContaFn({ data: dados }));
export const enviarEntregaMissao = (missaoId: string, texto?: string) => chamar(enviarEntregaMissaoFn({ data: { missaoId, texto } }));
export const solicitarPrivacidade = (tipo: SolicitacaoPrivacidade["tipo"], detalhes: string) =>
  chamar(solicitarPrivacidadeFn({ data: { tipo, detalhes } }));
export const abrirChamado = (dados: DadosChamado) => chamar(abrirChamadoFn({ data: dados }));
export const responderChamado = (chamadoId: string, corpo: string) => chamar(responderChamadoFn({ data: { chamadoId, corpo } }));
export const marcarNotificacaoLida = (notificacaoId: string) => chamar(marcarNotificacaoLidaFn({ data: { id: notificacaoId } }));
export const marcarNotificacoesLidas = (plataforma = false) => chamar(marcarNotificacoesLidasFn({ data: { plataforma } }));
export const definirSilencio = (parcial: { todas?: boolean; comunidade?: boolean }) => chamar(definirSilencioFn({ data: parcial }));
/** `null` remove a foto. */
export const definirFoto = (foto: string | null) => chamar(definirFotoFn({ data: { foto } }));
export const definirTema = (tema: Tema) => chamar(definirTemaFn({ data: { tema } }));
export const salvarFichaEmergencia = (dados: DadosFicha) => chamar(salvarFichaEmergenciaFn({ data: dados }));
export const salvarPreferenciaConta = (p: PreferenciaModalidades) =>
  chamar(salvarPreferenciaFn({ data: p as unknown as { estado: "pendente" | "todas" | "selecionadas"; modalidades: string[] } }));
