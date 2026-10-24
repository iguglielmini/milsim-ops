// Operações da conta do participante (missões, privacidade, suporte, notificações,
// aparência e preferências). Antes ficavam espalhadas nas páginas; agora rodam no
// servidor, sempre com a pessoa autenticada recebida da unidade de trabalho.
import { mutarBase, gerarId, ErroDominio } from "@/services/db";
import { enviarEntrega } from "@/services/missoes";
import { normalizarPreferencia, type PreferenciaModalidades } from "@/lib/modalidades";
import type { Chamado, SolicitacaoPrivacidade, Usuario } from "@/lib/domain/types";
import type { Tema } from "@/lib/localizacao";
import { erroFicha, montarFicha, type DadosFicha } from "@/lib/fichaEmergencia";
import { IDADE_MINIMA, idadeEmAnos, somenteDigitos, telefoneValido } from "@/lib/domain/validators";
import { NOMES_UF } from "@/lib/localizacao";

const agoraIso = () => new Date().toISOString();

// ---------- Missões ----------
/** Entrega simples (texto/confirmação). A regra completa fica em services/missoes.ts. */
export function enviarEntregaMissao(usuario: Usuario, missaoId: string, texto?: string): void {
  mutarBase((b) => { enviarEntrega(b, usuario, { missaoId, texto }); });
}

// ---------- Privacidade ----------
const TIPOS_PRIVACIDADE: SolicitacaoPrivacidade["tipo"][] = ["acesso", "correcao", "exportacao", "exclusao"];

export function solicitarPrivacidade(usuario: Usuario, tipo: SolicitacaoPrivacidade["tipo"], detalhes: string): void {
  if (!TIPOS_PRIVACIDADE.includes(tipo)) throw new ErroDominio("tipo", "Tipo de solicitação inválido.");
  mutarBase((b) => {
    b.privacidade.push({ id: gerarId("priv"), usuarioId: usuario.id, tipo, detalhes: detalhes.trim(), status: "aberta", criadoEm: agoraIso() });
    for (const admin of b.usuarios.filter((u) => u.perfil === "admin" && u.ativo)) {
      b.notificacoes.push({
        id: gerarId("not"), usuarioId: admin.id, titulo: "Solicitação de privacidade",
        corpo: `Nova solicitação de ${tipo}.`, link: "/admin", lida: false, criadoEm: agoraIso(),
      });
    }
  });
}

// ---------- Suporte ----------
export interface DadosChamado {
  assunto: string;
  categoria: string;
  descricao: string;
  eventoId?: string | undefined;
}

export function abrirChamado(usuario: Usuario, d: DadosChamado): Chamado {
  if (!d.assunto.trim() || !d.descricao.trim()) throw new ErroDominio("campos", "Informe assunto e descrição.");
  return mutarBase((b) => {
    if (d.eventoId && !b.eventos.some((e) => e.id === d.eventoId)) throw new ErroDominio("evento", "Evento não encontrado.");
    const chamado: Chamado = {
      id: gerarId("cha"),
      eventoId: d.eventoId || undefined,
      solicitanteId: usuario.id,
      assunto: d.assunto.trim(),
      categoria: d.categoria,
      descricao: d.descricao.trim(),
      status: "aberto",
      mensagens: [{ id: gerarId("msg"), autorId: usuario.id, corpo: d.descricao.trim(), criadoEm: agoraIso() }],
      criadoEm: agoraIso(),
      atualizadoEm: agoraIso(),
    };
    b.chamados.push(chamado);
    return chamado;
  });
}

export function responderChamado(usuario: Usuario, chamadoId: string, corpo: string): void {
  if (!corpo.trim()) throw new ErroDominio("corpo", "Escreva a mensagem.");
  mutarBase((b) => {
    const c = b.chamados.find((x) => x.id === chamadoId);
    if (!c) throw new ErroDominio("chamado", "Chamado não encontrado.");
    const evento = c.eventoId ? b.eventos.find((e) => e.id === c.eventoId) : undefined;
    const atende =
      usuario.perfil === "admin" ||
      (usuario.perfil === "organizador" && !!evento && evento.organizacaoId === usuario.organizacaoId);
    if (c.solicitanteId !== usuario.id && !atende) throw new ErroDominio("sem_permissao", "Você não participa deste chamado.");
    c.mensagens.push({ id: gerarId("msg"), autorId: usuario.id, corpo: corpo.trim(), criadoEm: agoraIso() });
    c.status = c.solicitanteId === usuario.id ? "aberto" : "aguardando_participante";
    c.atualizadoEm = agoraIso();
  });
}

// ---------- Notificações ----------
/** Marca uma notificação como lida (a própria; admin pode marcar qualquer uma). */
export function marcarNotificacaoLida(usuario: Usuario, id: string): void {
  mutarBase((b) => {
    const n = b.notificacoes.find((x) => x.id === id);
    if (n && (n.usuarioId === usuario.id || usuario.perfil === "admin")) n.lida = true;
  });
}

/** `plataforma` (somente admin) marca todas as notificações; senão, só as próprias. */
export function marcarNotificacoesLidas(usuario: Usuario, plataforma = false): void {
  if (plataforma && usuario.perfil !== "admin") throw new ErroDominio("sem_permissao", "Apenas administradores.");
  mutarBase((b) => {
    for (const n of b.notificacoes) if (plataforma || n.usuarioId === usuario.id) n.lida = true;
  });
}

// ---------- Foto de perfil ----------
const FOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const TAMANHO_MAXIMO_FOTO = 3 * 1024 * 1024; // caracteres do data URL (~2,2 MB de imagem)

/**
 * Define (data URL da foto já recortada) ou remove (null) a foto da própria conta.
 * Só aceita imagem enviada agora: a unidade de trabalho a envia ao Storage e grava a URL.
 */
export function definirFoto(usuario: Usuario, foto: string | null): void {
  if (foto !== null) validarFoto(foto);
  usuario.fotoUrl = foto ?? undefined;
}

/** Foto nova enviada pelo navegador: data URL de imagem, dentro do limite. */
export function validarFoto(foto: string): void {
  if (foto.length > TAMANHO_MAXIMO_FOTO) throw new ErroDominio("foto", "A foto é grande demais. Tente uma imagem menor.");
  if (!FOTO_DATA_URL.test(foto)) throw new ErroDominio("foto", "Formato de foto inválido. Use JPG, PNG ou WebP.");
}

// ---------- Aparência e preferências ----------
export function definirTema(usuario: Usuario, tema: Tema): void {
  if (tema !== "dark" && tema !== "light") throw new ErroDominio("tema", "Tema inválido.");
  usuario.tema = tema;
}

export function salvarPreferenciaModalidades(usuario: Usuario, p: PreferenciaModalidades): void {
  usuario.preferenciasModalidade = normalizarPreferencia(p);
}

// ---------- Dados da conta ----------
/** O que a própria pessoa pode alterar. CPF, e-mail e aceite dos termos ficam de fora. */
export interface DadosConta {
  nomeCompleto: string;
  dataNascimento: string;
  whatsapp: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | undefined;
  bairro: string;
  cidade: string;
  uf: string;
  instagram?: string | undefined;
  squad?: string | undefined;
}

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Atualiza os dados da própria conta com as mesmas regras do cadastro. Mudar a data de
 * nascimento recalcula a autorização do responsável (menor de 18 volta a "pendente", salvo
 * se já aprovada) e uma conta que passa a ser de menor fica com o perfil da comunidade privado.
 */
export function atualizarDadosConta(usuario: Usuario, d: DadosConta): void {
  const nome = d.nomeCompleto.trim().replace(/\s+/g, " ");
  if (!nome) throw new ErroDominio("nome", "Informe o nome completo.");
  if (!DATA_CIVIL.test(d.dataNascimento) || Number.isNaN(Date.parse(`${d.dataNascimento}T00:00:00Z`))) {
    throw new ErroDominio("nascimento", "Informe uma data de nascimento válida.");
  }
  const idade = idadeEmAnos(d.dataNascimento);
  if (idade < IDADE_MINIMA) throw new ErroDominio("idade", `É necessário ter ao menos ${IDADE_MINIMA} anos.`);
  if (idade > 120) throw new ErroDominio("nascimento", "Informe uma data de nascimento válida.");
  const whatsapp = somenteDigitos(d.whatsapp);
  if (!telefoneValido(whatsapp)) throw new ErroDominio("telefone", "Telefone/WhatsApp inválido.");
  const cep = somenteDigitos(d.cep);
  if (cep.length !== 8) throw new ErroDominio("cep", "Informe um CEP válido.");
  const uf = d.uf.trim().toUpperCase();
  if (!NOMES_UF[uf]) throw new ErroDominio("uf", "Selecione o estado.");
  const obrigatorios = { logradouro: d.logradouro, numero: d.numero, bairro: d.bairro, cidade: d.cidade };
  if (Object.values(obrigatorios).some((v) => !v.trim())) {
    throw new ErroDominio("endereco", "Preencha logradouro, número, bairro e cidade.");
  }

  usuario.nomeCompleto = nome;
  usuario.whatsapp = whatsapp;
  usuario.endereco = {
    cep,
    logradouro: d.logradouro.trim(),
    numero: d.numero.trim(),
    complemento: d.complemento?.trim() || undefined,
    bairro: d.bairro.trim(),
    cidade: d.cidade.trim(),
    uf,
  };
  usuario.instagram = d.instagram?.trim() || undefined;
  usuario.squad = d.squad?.trim() || undefined;
  if (usuario.dataNascimento !== d.dataNascimento) {
    usuario.dataNascimento = d.dataNascimento;
    if (idade < 18) {
      if (usuario.autorizacaoResponsavel !== "aprovada") usuario.autorizacaoResponsavel = "pendente";
      usuario.comunidadePrivada = true;
    } else {
      usuario.autorizacaoResponsavel = "nao_aplicavel";
    }
  }
}

// ---------- Ficha de emergência ----------
/** Grava (ou remove, se tudo vazio) a ficha da própria conta. Regras em lib/fichaEmergencia.ts. */
export function salvarFichaEmergencia(usuario: Usuario, dados: DadosFicha): void {
  const erro = erroFicha(dados);
  if (erro) throw new ErroDominio("ficha_emergencia", erro);
  usuario.fichaEmergencia = montarFicha(dados, usuario.fichaEmergencia);
}
