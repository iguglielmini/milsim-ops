# APIs do MilSim Ops

[← Documentação](../README.md) · [Regras de negócio](../regras-de-negocio.md) · [Fluxos](../fluxos.md) · [Arquitetura](../ARQUITETURA.md)

As APIs são **server functions** do TanStack Start, em `src/api/*.functions.ts`. Cada uma tem
uma página nesta pasta com entrada, regras, resposta, erros e um exemplo.

## Como chamar

Cada arquivo de `src/api/` exporta a server function (`xxxFn`) e um **wrapper** de mesmo nome
para o navegador. Use sempre o wrapper:

```ts
import { confirmarInscricao } from "@/api/inscricoes.functions";

const { inscricao, urlPagamento } = await confirmarInscricao({ eventoId, tipoId, exercitoId });
```

- **Resposta.** Quase toda server function devolve `{ resultado, visao }`. O wrapper passa a
  resposta por `chamar` (`src/api/cliente.ts`), que aplica a **visão** nova ao snapshot do
  navegador (as telas re-renderizam via `useVersaoBase()`) e devolve só o `resultado`. As páginas
  desta pasta mostram o `resultado`. As poucas que não mudam a visão (links assinados, métricas,
  configuração) devolvem o valor direto; a página de cada uma avisa.
- **Não é REST.** Por baixo, o TanStack Start expõe cada função num endpoint interno
  (`/_serverFn/…`) com serialização própria. Esse endereço não é um contrato estável: chame
  pela função importada. O único endpoint HTTP público é o
  [webhook do Stripe](webhooks/stripe-webhook-site.md).
- **Chamadas diretas.** Fora do navegador (testes, loaders), chame `xxxFn({ data })`; o `data`
  de cada exemplo é exatamente o que a função recebe.

## Autenticação e permissões

- A identidade vem **sempre** da sessão do Supabase Auth (cookies HTTP, JWT conferido no
  servidor com `getClaims`). Nenhuma API aceita `usuarioId` ou perfil vindos do navegador para
  decidir quem é a pessoa.
- Conta desativada é tratada como visitante.
- Perfis: **participante** (padrão), **organizador** (dono de uma organização aprovada) e
  **admin**. "Gestão do evento" = organizador da organização dona do evento ou admin. "Membro"
  da comunidade = quem tem inscrição **confirmada** no evento.
- Todas as server functions passam pelo middleware de **CSRF** de `src/start.ts`.
- O navegador nunca fala com o banco: o Supabase só é acessado pelo servidor, com a chave
  secreta, que nunca vai para o navegador.

## Validação e erros

- A entrada é validada com **zod** na própria server function (tamanhos, enums, formatos).
  Entrada inválida falha antes de qualquer regra.
- Regra de negócio violada lança `ErroDominio`: a **mensagem chega ao navegador** em
  `error.message` e pode ser mostrada como está. As listas "Erros" de cada página trazem essas
  mensagens, extraídas do código.
- Qualquer outro erro é registrado no log do servidor como `[erro CÓDIGO]` e vira a mensagem
  genérica "Não foi possível concluir a operação. Tente novamente. (código CÓDIGO)". Quando o
  banco não responde (5xx ou rede), a mensagem é "O servidor de dados não respondeu. Tente
  novamente em instantes. (código CÓDIGO)". O código liga a mensagem ao log com a causa real.
- Escritas concorrentes: a gravação usa versão otimista (`MS409`) e o servidor repete sozinho
  até 4 vezes; se ainda assim falhar, a mensagem é "Muitas alterações ao mesmo tempo. Tente novamente."

```ts
try {
  await cancelarInscricao(id, motivo);
} catch (e) {
  setErro(e instanceof Error ? e.message : "Falha ao cancelar.");
}
```

## Escritas: atomicidade e idempotência

- Toda escrita roda em `mutar` (`src/server/unidade.server.ts`): lê a base, executa a regra e
  grava todas as mudanças numa **única transação** (`aplicar_mudancas`). Ou tudo é gravado, ou nada.
- Efeitos externos (Stripe, Storage de documentos privados) acontecem **fora** da transação,
  antes ou depois dela, nunca dentro (a regra pode ser repetida num conflito).
- APIs que recebem `clienteId` são **idempotentes**: gere o id uma vez no navegador
  (`crypto.randomUUID()`) e reenvie o mesmo em caso de falha de rede. Valem para inscrição,
  abertura de chamado, mensagens e encaminhamentos do suporte.
- Confirmação de pagamento (webhook e retorno do checkout), reembolsos, concessão de insígnias e
  sincronização do check-in também são idempotentes.

## Arquivos

- Imagens e PDFs públicos (fotos, banners, imagens de publicações) são enviados como **data URL**
  no próprio campo; o servidor os grava no bucket público `midia` e troca pela URL pública.
- Documentos privados (notas fiscais e anexos do suporte) vão para o bucket **privado**
  `documentos`. O acesso é sempre por **link assinado de curta duração**, gerado depois de
  conferir a permissão. O tipo real do arquivo é conferido pelos primeiros bytes.

## Criando uma API nova

1. Regra pura em `src/lib/` (se houver decisão) e operação em `src/services/`, com teste.
2. Server function em `src/api/<modulo>.functions.ts`: valide com zod, identifique a pessoa
   com `exigirUsuario`/`exigirAdmin` e rode a regra dentro de `mutar` (escrita) ou `ler` (leitura).
3. Exporte o wrapper de navegador com `chamar(...)`.
4. Dados novos que vão para o navegador passam por `visaoParaUsuario` (`src/lib/visao.ts`), com teste.
5. Documente: uma página nova nesta pasta e uma linha no índice abaixo.

## Índice

159 server functions em 17 módulos, mais os [webhooks do Stripe](#webhooks).

### Sessão e leitura
<a id="sessao"></a>

Login, cadastro, recuperação de senha e a visão da pessoa. Arquivo: [`src/api/sessao.functions.ts`](../../src/api/sessao.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`recarregarVisao`](sessao/recarregarVisao.md) | GET | Pública (visitante recebe a visão de visitante) | Devolve a visão da pessoa: o recorte da base que ela pode ver (eventos, inscrições, notificações etc.). |
| [`obterEvento`](sessao/obterEvento.md) | GET | Pública | Carrega um evento e a organização dele para os carregadores de rota (`/eventos/$eventoId`, `/inscricao/$eventoId`, `/comunidade/$eventoId`), inclusive no SSR (título e metatags reais). |
| [`entrar`](sessao/entrar.md) | POST | Pública | Login com e-mail e senha (Supabase Auth). |
| [`sair`](sessao/sair.md) | POST | Pública | Encerra a sessão (`signOut`) e limpa os cookies. |
| [`cadastrar`](sessao/cadastrar.md) | POST | Pública | Cria a conta de participante: valida os dados, cria o usuário no Supabase Auth, grava o perfil e envia o e-mail de confirmação (sem confirmação ligada, já faz login). |
| [`confirmarEmail`](sessao/confirmarEmail.md) | POST | Pública | Confirma o e-mail pelo link do cadastro e abre a sessão. |
| [`reenviarConfirmacao`](sessao/reenviarConfirmacao.md) | POST | Pública | Reenvia o e-mail de confirmação de cadastro. |
| [`recuperarSenha`](sessao/recuperarSenha.md) | POST | Pública | Envia o e-mail de recuperação de senha (`resetPasswordForEmail`) com o template em português `supabase/templates/recuperar-senha.html`. |
| [`trocarCodigoRecuperacao`](sessao/trocarCodigoRecuperacao.md) | POST | Pública | Troca o `code` do link de recuperação por uma sessão (PKCE, `exchangeCodeForSession`). |
| [`validarTokenRecuperacao`](sessao/validarTokenRecuperacao.md) | POST | Pública (quem tem o link do e-mail) | Valida o link do e-mail de recuperação (`?token_hash=…&type=recovery`) e abre a sessão de recuperação (`verifyOtp`). |
| [`definirNovaSenha`](sessao/definirNovaSenha.md) | POST | Sessão de recuperação (depois de `validarTokenRecuperacao` ou `trocarCodigoRecuperacao`) | Define a nova senha da conta (`updateUser`) e devolve a visão da pessoa logada. |

### Conta
<a id="conta"></a>

Missões, privacidade, notificações, foto, tema e preferências. Arquivo: [`src/api/conta.functions.ts`](../../src/api/conta.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`enviarEntregaMissao`](conta/enviarEntregaMissao.md) | POST | Qualquer pessoa autenticada e ativa | Envia a entrega de uma missão de texto ou confirmação (mantida por compatibilidade). |
| [`atualizarDadosConta`](conta/atualizarDadosConta.md) | POST | Qualquer pessoa autenticada e ativa (só a própria conta) | Atualiza nome, nascimento, WhatsApp, endereço, Instagram e squad (CPF e e-mail não mudam). |
| [`solicitarPrivacidade`](conta/solicitarPrivacidade.md) | POST | Qualquer pessoa autenticada e ativa | Abre uma solicitação de privacidade (LGPD) para a administração. |
| [`abrirChamado`](conta/abrirChamado.md) (legada) | POST | Qualquer pessoa autenticada e ativa | Legada. |
| [`responderChamado`](conta/responderChamado.md) (legada) | POST | Qualquer pessoa autenticada e ativa | Legada. |
| [`marcarNotificacaoLida`](conta/marcarNotificacaoLida.md) | POST | Qualquer pessoa autenticada e ativa | Marca uma notificação da própria pessoa como lida. |
| [`marcarNotificacoesLidas`](conta/marcarNotificacoesLidas.md) | POST | Qualquer pessoa autenticada e ativa | Marca todas as notificações da pessoa como lidas. |
| [`definirSilencio`](conta/definirSilencio.md) | POST | Qualquer pessoa autenticada e ativa | Silencia notificações: todas (`todas`) ou só as da comunidade (`comunidade`). |
| [`definirFoto`](conta/definirFoto.md) | POST | Qualquer pessoa autenticada e ativa | Troca ou remove a foto de perfil. |
| [`definirTema`](conta/definirTema.md) | POST | Qualquer pessoa autenticada e ativa | Guarda o tema da conta (claro ou escuro). |
| [`salvarFichaEmergencia`](conta/salvarFichaEmergencia.md) | POST | Qualquer pessoa autenticada e ativa | Grava (ou remove) a ficha de emergência da própria conta, com a autorização de compartilhar. |
| [`salvarPreferenciaConta`](conta/salvarPreferenciaConta.md) | POST | Qualquer pessoa autenticada e ativa | Salva as modalidades favoritas da conta (usadas para ordenar a página inicial "Para você"). |

### Administração
<a id="admin"></a>

Solicitações de organizador, usuários, menores e privacidade. Arquivo: [`src/api/admin.functions.ts`](../../src/api/admin.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`analisarSolicitacao`](admin/analisarSolicitacao.md) | POST | Somente admin | Analisa uma solicitação para virar organizador: inicia a análise, aprova, pede ajustes ou rejeita. |
| [`desativarUsuario`](admin/desativarUsuario.md) | POST | Somente admin | Desativa uma conta. |
| [`aprovarAutorizacaoResponsavel`](admin/aprovarAutorizacaoResponsavel.md) | POST | Somente admin | Aprova a autorização do responsável de um participante de 15 a 17 anos, liberando inscrições. |
| [`responderPrivacidade`](admin/responderPrivacidade.md) | POST | Somente admin | Responde e conclui uma solicitação de privacidade (LGPD). |

### Organizador
<a id="organizador"></a>

Solicitação de organização, eventos, cupons e cortesias. Arquivo: [`src/api/organizador.functions.ts`](../../src/api/organizador.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`solicitarOrganizador`](organizador/solicitarOrganizador.md) | POST | Qualquer pessoa autenticada e ativa | Pede para virar organizador, informando os dados da organização. |
| [`reenviarSolicitacao`](organizador/reenviarSolicitacao.md) | POST | Dono da solicitação | Reenvia uma solicitação que recebeu pedido de ajustes, com os dados corrigidos. |
| [`salvarEvento`](organizador/salvarEvento.md) | POST | Organização dona do evento ou admin (criação: organizador da própria organização ou admin) | Cria ou atualiza um evento. |
| [`publicarEvento`](organizador/publicarEvento.md) | POST | Organização dona do evento ou admin | Publica o evento (passa a aparecer na página inicial e aceitar inscrições) e cria os fóruns da comunidade. |
| [`cancelarEvento`](organizador/cancelarEvento.md) | POST | Organização dona do evento ou admin | Cancela o evento: estorna todas as inscrições ativas, libera as reservas e reembolsa no Stripe o que foi pago online. |
| [`excluirEvento`](organizador/excluirEvento.md) | POST | Organização dona do evento ou admin | Exclui um evento sem inscrições (rascunhos ou eventos sem vendas). |
| [`criarCupom`](organizador/criarCupom.md) | POST | Organização dona do evento ou admin | Cria um cupom de desconto percentual para o evento. |
| [`atualizarCupom`](organizador/atualizarCupom.md) | POST | Organização dona do evento ou admin | Atualiza um cupom (o código e o evento não mudam). |
| [`criarCortesia`](organizador/criarCortesia.md) | POST | Organização dona do evento ou admin | Emite uma cortesia (ingresso gratuito) de uso único para um e-mail convidado. |

### Inscrições e pagamento
<a id="inscricoes"></a>

Inscrição, checkout do Stripe, cancelamento e prévia de cupom. Arquivo: [`src/api/inscricoes.functions.ts`](../../src/api/inscricoes.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`confirmarInscricao`](inscricoes/confirmarInscricao.md) | POST | Qualquer pessoa autenticada e ativa (sempre para si mesma) | Inscreve a pessoa logada no evento. |
| [`retomarPagamento`](inscricoes/retomarPagamento.md) | POST | Titular da reserva | Volta à página de pagamento de uma reserva ainda aberta (botão "Concluir pagamento" em Meus ingressos). |
| [`sincronizarPagamento`](inscricoes/sincronizarPagamento.md) | POST | Titular da sessão de checkout | Chamada no retorno do Stripe Checkout (`/app/ingressos?pagamento=sucesso&sessao=cs_…`): consulta o Stripe e aplica o resultado, sem depender do webhook. |
| [`cancelarInscricao`](inscricoes/cancelarInscricao.md) | POST | Titular, organização do evento ou admin | Cancela uma inscrição confirmada (estorno integral) ou libera uma reserva pendente. |
| [`incluirParticipantes`](inscricoes/incluirParticipantes.md) | POST | Organização do evento ou admin (lista de contas: só admin) | Inclui pessoas com conta no evento (pagamento por fora), como cortesia confirmada. |
| [`previsualizarCupom`](inscricoes/previsualizarCupom.md) | POST | Pública | Valida um cupom para mostrar o desconto na tela de inscrição. |

### Repasse (Stripe Connect)
<a id="repasses"></a>

Conta de recebimento das organizações e taxa da plataforma. Arquivo: [`src/api/repasses.functions.ts`](../../src/api/repasses.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`configuracaoRepasse`](repasses/configuracaoRepasse.md) | GET | Pública | Informa se os pagamentos online (Stripe) e os painéis embutidos do Stripe estão ativos. |
| [`definirTaxaPlataforma`](repasses/definirTaxaPlataforma.md) | POST | Somente admin | Define a taxa da plataforma (%) retida em cada venda repassada às organizações. |
| [`definirTaxaComprador`](repasses/definirTaxaComprador.md) | POST | Organizador da própria organização ou admin | Define a taxa de serviço (%) que a organização cobra do comprador, somada ao ingresso e repassada a ela (padrão 0%). |
| [`cadastrarRecebimento`](repasses/cadastrarRecebimento.md) | POST | Quem gere a organização (organizador dela ou admin) | Cria (ou reaproveita) a conta Stripe Connect Express da organização e devolve o link do cadastro hospedado pelo Stripe. |
| [`atualizarRecebimento`](repasses/atualizarRecebimento.md) | POST | Quem gere a organização | Consulta a conta Connect no Stripe e atualiza a situação do recebimento (`organizacao.recebimento`). |
| [`abrirPainelStripe`](repasses/abrirPainelStripe.md) | POST | Quem gere a organização | Gera um link de acesso ao painel Express do Stripe (saldo, saques, dados bancários). |
| [`saldoRecebimento`](repasses/saldoRecebimento.md) | POST | Quem gere a organização | Lê do Stripe o saldo da conta de recebimento da organização: disponível, a liberar, próximo saque, últimos saques, cronograma de saques e banco de destino (só os últimos dígitos). |
| [`sessaoComponentesStripeOrg`](repasses/sessaoComponentesStripeOrg.md) | POST | Quem gere a organização | Cria a sessão dos componentes embutidos do Stripe (painéis de saques e de pagamentos dentro de Financeiro) para a conta da organização. |

### Comunidade
<a id="comunidade"></a>

Fóruns, publicações, respostas, curtidas, denúncias e moderação. Arquivo: [`src/api/comunidade.functions.ts`](../../src/api/comunidade.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`garantirForuns`](comunidade/garantirForuns.md) | POST | Quem tem papel no evento (membro ou gestão) | Garante que o evento tenha os 5 fóruns iniciais, abertos a todos os inscritos: Avisos oficiais (só a gestão publica), Conversa geral, Dúvidas e preparação, Caronas e logística, Fotos e experiências. |
| [`registrarVisita`](comunidade/registrarVisita.md) | POST | Qualquer pessoa autenticada | Registra a última visita da pessoa à comunidade do evento; base do contador de novidades por fórum. |
| [`criarPublicacao`](comunidade/criarPublicacao.md) | POST | Membro do evento (inscrição confirmada) ou gestão (organização do evento/admin); em fóruns "só gestão", apenas a gestão | Publica no fórum (texto e até 4 imagens). |
| [`editarPublicacao`](comunidade/editarPublicacao.md) | POST | Autor do conteúdo | Edita texto e imagens da própria publicação. |
| [`excluirPublicacao`](comunidade/excluirPublicacao.md) | POST | Autor do conteúdo | Remove a própria publicação. |
| [`alternarCurtida`](comunidade/alternarCurtida.md) | POST | Membro do evento (inscrição confirmada) ou gestão (organização do evento/admin) | Curte ou descurte uma publicação. |
| [`responder`](comunidade/responder.md) | POST | Membro do evento (inscrição confirmada) ou gestão (organização do evento/admin); em fóruns com respostas "só gestão", apenas a gestão | Responde a uma publicação (texto e uma imagem opcional). |
| [`editarResposta`](comunidade/editarResposta.md) | POST | Autor do conteúdo | Edita a própria resposta. |
| [`excluirResposta`](comunidade/excluirResposta.md) | POST | Autor do conteúdo | Remove a própria resposta. |
| [`denunciar`](comunidade/denunciar.md) | POST | Quem vê o conteúdo | Denuncia uma publicação ou resposta para a gestão do evento. |
| [`analisarDenuncia`](comunidade/analisarDenuncia.md) | POST | Gestão do evento: organização dona ou admin | Registra a decisão sobre uma denúncia: procedente ou descartada. |
| [`fixarPublicacao`](comunidade/fixarPublicacao.md) | POST | Gestão do evento: organização dona ou admin | Fixa ou desafixa uma publicação no topo do fórum. |
| [`alternarRespostas`](comunidade/alternarRespostas.md) | POST | Gestão do evento: organização dona ou admin | Fecha ou reabre as respostas de uma publicação. |
| [`ocultarConteudo`](comunidade/ocultarConteudo.md) | POST | Gestão do evento: organização dona ou admin | Oculta (ou volta a mostrar) uma publicação ou resposta. |
| [`moverPublicacao`](comunidade/moverPublicacao.md) | POST | Gestão do evento: organização dona ou admin | Move uma publicação para outro fórum do mesmo evento. |
| [`suspenderUsuario`](comunidade/suspenderUsuario.md) | POST | Gestão do evento: organização dona ou admin | Suspende um participante na comunidade do evento: ele continua lendo, mas não publica, responde nem curte. |
| [`reativarUsuario`](comunidade/reativarUsuario.md) | POST | Gestão do evento: organização dona ou admin | Retira a suspensão de um participante na comunidade do evento. |
| [`criarForum`](comunidade/criarForum.md) | POST | Gestão do evento: organização dona ou admin | Cria um fórum no evento. |
| [`editarForum`](comunidade/editarForum.md) | POST | Gestão do evento: organização dona ou admin | Edita nome, descrição, regras e permissões de um fórum. |
| [`moverOrdemForum`](comunidade/moverOrdemForum.md) | POST | Gestão do evento: organização dona ou admin | Sobe ou desce o fórum na lista. |
| [`alternarArquivoForum`](comunidade/alternarArquivoForum.md) | POST | Gestão do evento: organização dona ou admin | Arquiva ou reativa um fórum. |
| [`excluirForum`](comunidade/excluirForum.md) | POST | Gestão do evento: organização dona ou admin | Exclui um fórum vazio. |
| [`definirPreferenciaForum`](comunidade/definirPreferenciaForum.md) | POST | Quem vê o fórum | Segue, silencia ou volta ao padrão de notificações de um fórum. |
| [`atualizarNomeExibicao`](comunidade/atualizarNomeExibicao.md) | POST | Qualquer pessoa autenticada | Define o nome exibido na comunidade (no lugar do nome completo). |

### Comunidade geral
<a id="social"></a>

Feed estilo Twitter (posts de até 220 caracteres e 4 fotos), fóruns públicos e privados, seguir, bloqueio, denúncia e moderação. **Fora da base**: leituras paginadas por `social_posts_page()` (sem visão nem `chamar`). Arquivo: [`src/api/social.functions.ts`](../../src/api/social.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`lerFeed`](social/lerFeed.md) | POST | Pública (visitante vê só perfis públicos) | Página do feed geral (posts sem as respostas), do mais novo para o mais antigo. |
| [`lerPostsDoAutor`](social/lerPostsDoAutor.md) | POST | Pública (perfil privado: só seguidores aprovados) | Posts de uma pessoa (aba Publicações do perfil do operador). |
| [`lerPost`](social/lerPost.md) | POST | Pública (respeita a visibilidade do autor) | Uma publicação, o post a que ela responde (se visível) e a primeira página de respostas. |
| [`lerRespostas`](social/lerRespostas.md) | POST | Pública (respeita a visibilidade de cada autor) | Próximas páginas de respostas de uma publicação. |
| [`lerPerfilSocial`](social/lerPerfilSocial.md) | POST | Pública | Cabeçalho social de um perfil: seguidores, seguindo, público/privado e a relação com quem vê. |
| [`lerPedidosParaSeguir`](social/lerPedidosParaSeguir.md) | POST | Qualquer pessoa autenticada e ativa | Pedidos para seguir aguardando a aprovação da própria conta. |
| [`lerDenunciasPendentes`](social/lerDenunciasPendentes.md) | POST | Admin | Fila de moderação: denúncias pendentes com a publicação denunciada. |
| [`publicarPost`](social/publicarPost.md) | POST | Qualquer pessoa autenticada e ativa | Publica no feed geral ou responde a uma publicação. |
| [`excluirPost`](social/excluirPost.md) | POST | Autor da publicação | Exclui a própria publicação (some do feed e do perfil). |
| [`curtirPost`](social/curtirPost.md) | POST | Qualquer pessoa autenticada e ativa | Curte ou descurte uma publicação visível. |
| [`seguir`](social/seguir.md) | POST | Qualquer pessoa autenticada e ativa | Segue uma pessoa (ou pede para seguir, se o perfil é privado). |
| [`deixarDeSeguir`](social/deixarDeSeguir.md) | POST | Qualquer pessoa autenticada e ativa | Deixa de seguir (ou cancela o pedido para seguir). |
| [`responderPedido`](social/responderPedido.md) | POST | Dono do perfil seguido | Aceita ou recusa um pedido para seguir. |
| [`bloquear`](social/bloquear.md) | POST | Qualquer pessoa autenticada e ativa | Bloqueia ou desbloqueia uma pessoa na comunidade geral. |
| [`denunciarPost`](social/denunciarPost.md) | POST | Qualquer pessoa autenticada e ativa | Denuncia uma publicação para a moderação do admin. |
| [`resolverDenuncia`](social/resolverDenuncia.md) | POST | Admin | Oculta a publicação denunciada ou descarta a denúncia. |
| [`lerPostsAuditoria`](social/lerPostsAuditoria.md) | POST | Admin | Auditoria: últimas publicações de toda a comunidade, da mais nova para a mais antiga. |
| [`moderarPost`](social/moderarPost.md) | POST | Admin | Oculta uma publicação (sem precisar de denúncia) ou restaura uma ocultada. |
| [`definirPerfilComunidade`](social/definirPerfilComunidade.md) | POST | Qualquer pessoa autenticada e ativa | Define o perfil na comunidade geral como público ou privado. |
| [`lerForuns`](social/lerForuns.md) | POST | Pública | Lista de fóruns ativos (os da pessoa primeiro, depois os mais movimentados). |
| [`lerForum`](social/lerForum.md) | POST | Pública | Um fórum e se quem vê pode ler o conteúdo. |
| [`lerPostsDoForum`](social/lerPostsDoForum.md) | POST | Pública (privado: só membros aprovados) | Página de publicações de um fórum. |
| [`lerMembrosDoForum`](social/lerMembrosDoForum.md) | POST | Membros aprovados: quem lê o fórum; pedidos: dono e moderadores | Membros aprovados ou pedidos pendentes de um fórum. |
| [`criarForum`](social/criarForum.md) | POST | Qualquer pessoa autenticada e ativa | Cria um fórum; quem cria vira o dono. |
| [`editarForum`](social/editarForum.md) | POST | Dono do fórum | Altera nome, descrição e visibilidade. |
| [`arquivarForum`](social/arquivarForum.md) | POST | Dono do fórum ou admin | Arquiva o fórum: some da lista e ninguém mais lê nem publica. |
| [`entrarNoForum`](social/entrarNoForum.md) | POST | Qualquer pessoa autenticada e ativa | Entra num fórum público ou pede para entrar num privado. |
| [`sairDoForum`](social/sairDoForum.md) | POST | Membro (ou quem pediu para entrar) | Sai do fórum ou cancela o pedido para entrar. |
| [`responderEntrada`](social/responderEntrada.md) | POST | Dono ou moderador do fórum | Aprova ou recusa um pedido para entrar. |
| [`removerMembro`](social/removerMembro.md) | POST | Dono ou moderador do fórum | Remove um membro do fórum. |
| [`definirModerador`](social/definirModerador.md) | POST | Dono do fórum | Torna um membro aprovado moderador (ou tira a moderação). |
| [`ocultarPostDoForum`](social/ocultarPostDoForum.md) | POST | Dono ou moderador do fórum do post | Oculta uma publicação (ou resposta) do fórum. |

### Perfil do operador
<a id="perfil"></a>

Perfil social, privacidade, arsenal, galeria e notas fiscais privadas. Arquivo: [`src/api/perfil.functions.ts`](../../src/api/perfil.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`obterPerfil`](perfil/obterPerfil.md) | POST | Pública (o conteúdo depende de quem vê e da privacidade do dono) | Monta o perfil social de um operador (callsign, bio, histórico, mapa, insígnias, equipamentos e fotos) já filtrado pela privacidade. |
| [`salvarPerfil`](perfil/salvarPerfil.md) | POST | Dono do perfil (a própria conta) | Atualiza o perfil social: callsign, bio, squad, Instagram, capa e insígnia em destaque. |
| [`salvarPrivacidade`](perfil/salvarPrivacidade.md) | POST | Dono do perfil (a própria conta) | Define quem vê cada bloco do perfil. |
| [`marcarIntro`](perfil/marcarIntro.md) | POST | Dono do perfil (a própria conta) | Marca a apresentação do perfil como vista (não aparece de novo). |
| [`ocultarOperacao`](perfil/ocultarOperacao.md) | POST | Dono do perfil (a própria conta) | Oculta (ou volta a mostrar) uma operação no histórico público do perfil. |
| [`salvarEquipamento`](perfil/salvarEquipamento.md) | POST | Dono do perfil (a própria conta) | Cria ou atualiza um equipamento do arsenal. |
| [`excluirEquipamento`](perfil/excluirEquipamento.md) | POST | Dono do perfil (a própria conta) | Exclui um equipamento. |
| [`adicionarFoto`](perfil/adicionarFoto.md) | POST | Dono do perfil (a própria conta) | Adiciona uma foto à galeria do perfil. |
| [`editarFoto`](perfil/editarFoto.md) | POST | Dono do perfil (a própria conta) | Edita legenda, texto alternativo e visibilidade de uma foto. |
| [`excluirFoto`](perfil/excluirFoto.md) | POST | Dono do perfil (a própria conta) | Remove uma foto da galeria. |
| [`enviarNota`](perfil/enviarNota.md) | POST | Dono do equipamento | Anexa (ou substitui) a nota fiscal de um equipamento. |
| [`linkNota`](perfil/linkNota.md) | POST | Dono do equipamento | Gera um link assinado de 60 segundos para ver ou baixar a nota fiscal. |
| [`excluirNota`](perfil/excluirNota.md) | POST | Dono do equipamento | Apaga a nota fiscal do equipamento (arquivo e metadados). |
| [`salvarOperacaoExterna`](perfil/salvarOperacaoExterna.md) | POST | Dono do perfil (a própria conta) | Registra (ou edita) uma operação de que o operador participou fora da plataforma, com foto obrigatória. |
| [`excluirOperacaoExterna`](perfil/excluirOperacaoExterna.md) | POST | Dono do perfil (a própria conta) | Exclui uma operação registrada fora da plataforma. |

### Central de Suporte
<a id="suporte"></a>

Chamados, mensagens, encaminhamento à organização e anexos. Arquivo: [`src/api/suporte.functions.ts`](../../src/api/suporte.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`abrirChamadoSuporte`](suporte/abrirChamadoSuporte.md) | POST | Qualquer pessoa autenticada e ativa | Abre um chamado na Central de Suporte, sobre um evento ou sobre a plataforma, com anexo opcional. |
| [`enviarMensagemSuporte`](suporte/enviarMensagemSuporte.md) | POST | Solicitante, admin ou organização que recebeu encaminhamento | Envia uma mensagem no chamado (com anexo opcional). |
| [`encaminharChamado`](suporte/encaminharChamado.md) | POST | Somente admin | Encaminha um chamado de evento para a organização responsável, com orientação e os anexos escolhidos. |
| [`marcarRetornoEnviado`](suporte/marcarRetornoEnviado.md) | POST | Organizador da organização destinatária do encaminhamento | A organização sinaliza que já respondeu ao encaminhamento. |
| [`assumirChamado`](suporte/assumirChamado.md) | POST | Somente admin | Define o responsável pelo chamado: o próprio admin (assumir) ou outro admin (atribuir). |
| [`alterarStatusChamado`](suporte/alterarStatusChamado.md) | POST | Admin (aguardar/resolver); solicitante ou admin (reabrir/fechar) | Muda o status do chamado. |
| [`marcarLidoServidor`](suporte/marcarLidoServidor.md) | POST | Quem vê o chamado | Registra até onde a pessoa leu o chamado (contador de não lidas). |
| [`linkAnexo`](suporte/linkAnexo.md) | POST | Quem pode ver aquela mensagem (organização: só anexos compartilhados com ela) | Gera um link assinado de curta duração para abrir ou baixar um anexo do chamado. |

### Página inicial
<a id="divulgacao"></a>

Seções e parceiros da página inicial. Arquivo: [`src/api/divulgacao.functions.ts`](../../src/api/divulgacao.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`salvarSecao`](divulgacao/salvarSecao.md) | POST | Somente admin | Cria ou edita uma seção da página inicial: destaques, regional, patrocinadores, apoiadores ou banner. |
| [`alterarStatusSecao`](divulgacao/alterarStatusSecao.md) | POST | Somente admin | Publica, volta para rascunho ou desativa uma seção. |
| [`excluirSecao`](divulgacao/excluirSecao.md) | POST | Somente admin | Exclui uma seção da página inicial. |
| [`reordenarSecoes`](divulgacao/reordenarSecoes.md) | POST | Somente admin | Define a ordem das seções na página inicial. |
| [`salvarParceiro`](divulgacao/salvarParceiro.md) | POST | Somente admin | Cria ou edita um parceiro (patrocinador e/ou apoiador) com logo e links (site, Instagram, WhatsApp, externo). |
| [`excluirParceiro`](divulgacao/excluirParceiro.md) | POST | Somente admin | Exclui um parceiro (sai também das seções que o usavam). |

### Métricas
<a id="analytics"></a>

Coleta anônima, leitura e campanhas de rastreio. Arquivo: [`src/api/analytics.functions.ts`](../../src/api/analytics.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`enviarRegistros`](analytics/enviarRegistros.md) | POST | Pública (sem login) | Recebe em lote os registros anônimos de métricas (exibição, clique, visita, início e conclusão de inscrição…). |
| [`listarMetricas`](analytics/listarMetricas.md) | GET | Organizador (eventos da organização) ou admin (todos) | Devolve os registros de métricas e as campanhas dos eventos que a pessoa gere. |
| [`criarCampanha`](analytics/criarCampanha.md) | POST | Organização dona do evento ou admin | Cria uma campanha de rastreio (link com `?cmp=<id>`) para medir de onde vêm visitas e inscrições. |

### Missões pré-evento
<a id="missoes"></a>

Missões, entregas, avaliação, placar por exército, prêmios e temporada. Arquivo: [`src/api/missoes.functions.ts`](../../src/api/missoes.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`salvarMissao`](missoes/salvarMissao.md) | POST | Organização dona do evento ou admin | Cria ou edita uma missão pré-evento. |
| [`publicarMissao`](missoes/publicarMissao.md) | POST | Organização dona do evento ou admin | Publica a missão (sai do rascunho) e avisa os destinatários uma única vez: post importante em "Avisos oficiais" (missão para todos) ou no fórum do exército; sem fórum do exército, notificação direta. |
| [`excluirMissao`](missoes/excluirMissao.md) | POST | Organização dona do evento ou admin | Exclui uma missão sem entregas. |
| [`enviarEntrega`](missoes/enviarEntrega.md) | POST | Inscrito confirmado no evento, no exército de destino da missão | Envia a entrega da missão: confirmação, texto/link, foto ou código secreto. |
| [`avaliarEntrega`](missoes/avaliarEntrega.md) | POST | Organização dona do evento ou admin | Aprova (dá os pontos), pede ajustes (libera reenvio) ou recusa uma entrega. |
| [`destacarEntrega`](missoes/destacarEntrega.md) | POST | Organização dona do evento ou admin | Publica uma entrega aprovada em "Avisos oficiais" da comunidade do evento (com o nome de exibição e o exército). |
| [`salvarPremios`](missoes/salvarPremios.md) | POST | Organização dona do evento ou admin | Declara os prêmios do dia do evento por colocação do exército (ex.: "Começa com a base norte"). |
| [`encerrarCampanha`](missoes/encerrarCampanha.md) | POST | Organização dona do evento ou admin | Congela o placar, aplica os prêmios e publica o resultado na comunidade. |
| [`placarMissoes`](missoes/placarMissoes.md) | POST | Inscrito confirmado no evento ou a gestão | Placar dos exércitos (ao vivo ou congelado) e top 10 individual, calculados no servidor: o navegador não recebe as entregas dos outros. |
| [`temporadaMissoes`](missoes/temporadaMissoes.md) | POST | Gestão da organização, admin ou quem já se inscreveu num evento dela | Ranking da temporada: pontos de missões somados em todos os eventos da organização que começam no ano. |

### Check-in
<a id="checkin"></a>

Sincronização da fila da portaria (offline). Arquivo: [`src/api/checkin.functions.ts`](../../src/api/checkin.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`enviarFilaCheckin`](checkin/enviarFilaCheckin.md) | POST | Organização dona do evento ou admin (o próprio operador dos registros) | Envia a fila de check-ins feita no aparelho da portaria (funciona offline, guardada no IndexedDB) e devolve o resultado de cada operação. |

### Gamificação
<a id="gamificacao"></a>

Insígnias, campanhas de recompensa e correção de participação. Arquivo: [`src/api/gamificacao.functions.ts`](../../src/api/gamificacao.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`salvarInsignia`](gamificacao/salvarInsignia.md) | POST | Somente admin | Cria ou edita uma insígnia e o critério para conquistá-la. |
| [`salvarCampanha`](gamificacao/salvarCampanha.md) | POST | Organização responsável pelos eventos ou admin (com referência da oferta autorizada) | Cria ou edita uma campanha de recompensa: quem conquistar a insígnia ganha um benefício (desconto percentual, valor fixo ou gratuidade) em eventos da organização. |
| [`corrigirParticipacao`](gamificacao/corrigirParticipacao.md) | POST | Somente admin | Corrige a presença de alguém num evento (validar sem check-in ou invalidar), com justificativa. |

### Impulsionamento
<a id="impulsionamentos"></a>

Campanhas de destaque de eventos na página inicial. Arquivo: [`src/api/impulsionamentos.functions.ts`](../../src/api/impulsionamentos.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`salvarImpulsionamento`](impulsionamentos/salvarImpulsionamento.md) | POST | Somente admin | Cria ou edita uma campanha de impulsionamento: o evento ganha prioridade nas seções escolhidas da página inicial, num período e numa região. |
| [`alterarImpulsionamento`](impulsionamentos/alterarImpulsionamento.md) | POST | Somente admin | Pausa, retoma ou encerra uma campanha de impulsionamento. |

### Impulsos das organizações
<a id="impulsos"></a>

Impulsos comprados pela organização (24h a 30 dias) e usados nas próprias operações. Arquivo: [`src/api/impulsos.functions.ts`](../../src/api/impulsos.functions.ts).

| API | Método | Acesso | O que faz |
|---|---|---|---|
| [`comprarImpulso`](impulsos/comprarImpulso.md) | POST | Organizador ativo | Compra um impulso para a organização e abre o pagamento no Stripe Checkout da plataforma. |
| [`retomarPagamentoImpulso`](impulsos/retomarPagamentoImpulso.md) | POST | Organizador ativo | Volta à página de pagamento de um impulso que ainda aguarda pagamento. |
| [`sincronizarPagamentoImpulso`](impulsos/sincronizarPagamentoImpulso.md) | POST | Organizador ativo | Retorno do checkout: consulta o Stripe e aplica o pagamento do impulso. |
| [`usarImpulso`](impulsos/usarImpulso.md) | POST | Organizador ativo | Usa um impulso disponível numa operação publicada: cria a campanha de destaque. |
| [`salvarPlanosImpulso`](impulsos/salvarPlanosImpulso.md) | POST | Somente admin | Define preço, validade, imagem e venda dos tipos de impulso e atualiza os produtos no Stripe. |
| [`sincronizarPlanosImpulso`](impulsos/sincronizarPlanosImpulso.md) | POST | Somente admin | Cria ou atualiza no Stripe o produto e o preço de cada tipo de impulso. |

### Webhooks
<a id="webhooks"></a>

| Endpoint | Quem chama | O que faz |
|---|---|---|
| [`stripe-webhook`](webhooks/stripe-webhook-edge.md) (Edge Function) | Stripe | Confere a assinatura do Stripe e repassa o evento ao site. |
| [`POST /api/stripe/webhook`](webhooks/stripe-webhook-site.md) | Edge Function `stripe-webhook` | Aplica pagamentos, reembolsos e a situação das contas Connect. |
