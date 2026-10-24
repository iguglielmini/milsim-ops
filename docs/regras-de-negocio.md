# Regras de negócio

[← Documentação](README.md) · [Fluxos](fluxos.md) · [APIs](api/README.md) · [Arquitetura](ARQUITETURA.md)

O que o sistema decide e onde essa decisão mora no código. Cada regra existe **num lugar só**
(função pura em `src/lib/` ou operação em `src/services/`) e é reaplicada no servidor em toda
escrita. As telas só refletem o resultado. Valores entre parênteses são os limites atuais.

## Sumário

1. [Perfis e permissões](#1-perfis-e-permissões)
2. [Conta e cadastro](#2-conta-e-cadastro)
3. [Organizações](#3-organizações)
4. [Eventos](#4-eventos)
5. [Ingressos, lotes e cupons](#5-ingressos-lotes-e-cupons)
6. [Inscrição](#6-inscrição)
7. [Pagamento online (Stripe)](#7-pagamento-online-stripe)
8. [Cancelamento, estorno e reembolso](#8-cancelamento-estorno-e-reembolso)
9. [Repasse às organizações e taxa](#9-repasse-às-organizações-e-taxa)
10. [Financeiro do evento](#10-financeiro-do-evento)
11. [Check-in](#11-check-in)
12. [Participação, insígnias e recompensas](#12-participação-insígnias-e-recompensas)
13. [Comunidade](#13-comunidade)
14. [Central de Suporte](#14-central-de-suporte)
15. [Página inicial, divulgação e impulsionamento](#15-página-inicial-divulgação-e-impulsionamento)
16. [Métricas](#16-métricas)
17. [Notificações](#17-notificações)
18. [Privacidade e dados pessoais](#18-privacidade-e-dados-pessoais)
19. [Lacunas conhecidas](#19-lacunas-conhecidas)

---

## 1. Perfis e permissões

| Perfil | Quem é | Pode |
|---|---|---|
| Visitante | sem login (ou conta desativada) | ver eventos públicos, página inicial e perfis em modo restrito |
| Participante | toda conta nova | inscrever-se, comunidade dos eventos em que está confirmado, suporte, perfil, privacidade |
| Organizador | participante com organização aprovada | tudo do participante + gerir os eventos da própria organização |
| Admin | definido no banco | tudo, em qualquer organização, mais administração da plataforma |

- **Gestão do evento** = organizador da organização dona do evento **ou** admin. Vale para editar,
  publicar, cancelar, cupons, cortesias, inscritos, check-in, financeiro, comunidade e métricas.
- **Membro da comunidade** = quem tem inscrição **confirmada** no evento (reserva pendente não conta).
- A identidade vem sempre da sessão; nenhuma API confia em `usuarioId`/perfil enviados pelo navegador.
- **Leituras**: cada pessoa recebe só a sua **visão** (`visaoParaUsuario`, `src/lib/visao.ts`).
  Dados que ela não pode ver nem chegam ao navegador (ver [seção 18](#18-privacidade-e-dados-pessoais)).
- Conta **desativada** (`ativo = false`) é tratada como visitante em tudo. O último admin ativo não
  pode ser desativado. → [`desativarUsuario`](api/admin/desativarUsuario.md)

## 2. Conta e cadastro

Código: `src/services/auth.ts`, `src/server/auth.server.ts`, `src/lib/domain/validators.ts`.

- Obrigatórios: CPF válido, nome, nascimento, e-mail válido, WhatsApp com DDD, endereço,
  senha (mínimo **6** caracteres, com letra minúscula, maiúscula, número e símbolo, e confirmação)
  e aceite dos termos e do aviso de privacidade.
- Requisitos de senha em `src/lib/domain/senha.ts`, espelhando a configuração do Supabase Auth
  (Authentication → Email); se mudar lá, mude o módulo. O Supabase também recusa senhas vazadas
  (HaveIBeenPwned) e o erro chega traduzido. As telas mostram a checklist ao vivo e todo campo de
  senha tem o botão de olho (`InputSenha`).
- **Idade mínima: 15 anos.** De 15 a 17 anos a conta nasce com `autorizacaoResponsavel = pendente`
  e **não pode se inscrever** até o admin aprovar. → [`aprovarAutorizacaoResponsavel`](api/admin/aprovarAutorizacaoResponsavel.md)
- **CPF e e-mail são únicos.** Se o perfil não puder ser gravado, a conta criada no Auth é apagada.
- **Editar os próprios dados** (Meu perfil › Editar dados): nome, nascimento, WhatsApp, endereço, Instagram e squad,
  com as mesmas validações do cadastro. **CPF, e-mail e aceite dos termos não mudam** (correção pelo suporte). Mudar o
  nascimento recalcula a autorização do responsável (menor de 18 → `pendente`, salvo se já aprovada, e comunidade
  privada; 18+ → `nao_aplicavel`). → [`atualizarDadosConta`](api/conta/atualizarDadosConta.md)
- **Confirmação de e-mail obrigatória** para contas novas (`src/lib/confirmacaoEmail.ts`): o cadastro cria a conta e
  envia um link (modelo `supabase/templates/confirmar-email.html`, link por `token_hash`, vale 1 hora e em qualquer
  aparelho). Até abrir o link a pessoa não entra ("Confirme seu e-mail para entrar…") e pode pedir outro e-mail
  (no login, na tela pós-cadastro ou em `/confirmar-email`), sem revelar se a conta existe. Ao confirmar, entra e
  volta para onde o cadastro começou (ex.: inscrição do evento). **Contas criadas antes** já nasceram confirmadas e
  não precisam fazer nada. Sem a confirmação ligada no Supabase (ex.: ambiente local), a conta entra logada como antes.
- Recuperação de senha por link de e-mail de uso único; a resposta não revela se o e-mail existe.
- Login, cadastro e pedido de redefinição de senha mostram o Cloudflare Turnstile (`src/components/Turnstile.tsx`); o token é conferido pelo CAPTCHA do Supabase Auth, e cada token vale uma tentativa.
- Foto de perfil: JPEG, PNG ou WebP, recortada no navegador, até ~2,2 MB.
- Tema: visitante sempre escuro; a conta guarda claro ou escuro.
- Preferência de modalidades: `todas`, `selecionadas` (ids do catálogo) ou `pendente`; ordena a
  página inicial "Para você". Ids fora do catálogo são descartados.

## 3. Organizações

Código: `src/services/organizador.ts`, `src/services/admin.ts`.

- Qualquer conta pode pedir para virar organizador ([`solicitarOrganizador`](api/organizador/solicitarOrganizador.md)):
  nome da organização, telefone e, se tiver, CNPJ válido. **Uma solicitação em andamento por pessoa.**
- Estados da solicitação: `pendente` → `em_analise` → `aprovada` | `ajustes_solicitados` | `rejeitada`.
  Pedir ajustes ou rejeitar exige justificativa. Com ajustes, a pessoa corrige e reenvia (volta a `pendente`).
- **Aprovar cria a organização** (status `ativa`), promove a conta a organizador e libera `/organizacao`.
- Toda decisão é notificada e auditada.

## 4. Eventos

Código: `src/services/organizador.ts`, `src/lib/eventoEditor.ts`, `src/lib/contatoEvento.ts`.

**Status**: `rascunho` → `publicado` → (`cancelado`). Também existem `inscricoes_encerradas`,
`concluido` e `arquivado` no modelo, mas nenhuma tela muda para eles hoje (ver [lacunas](#19-lacunas-conhecidas)).

- Evento novo nasce em **rascunho** e só a gestão o vê. O status muda por publicar, cancelar ou
  **conclusão automática**; a organização dona e a data de criação nunca mudam numa edição.
- **Conclusão automática** (`src/lib/cicloEvento.ts`): evento `publicado` ou `inscricoes_encerradas` cujo
  término já passou vira `concluido` (rascunho, cancelado e arquivado não mudam). Sem tarefa agendada: a
  unidade de trabalho do servidor aplica na primeira leitura ou gravação depois do término, registra na
  auditoria (autor "sistema", ação `conclusao_automatica_evento`) e recalcula participação, insígnias e
  recompensas na mesma gravação. Evento concluído não pode mais ser editado.
- **Publicar** exige: nome, modalidade, descrição resumida (até 200), enredo, local, imagem
  principal, ao menos um exército, um tipo de ingresso e uma atividade no cronograma, todas dentro
  do período do evento. Publicar cria os fóruns da comunidade.
- Data e horário das atividades são lidos no **fuso do evento** (`src/lib/fusoHorario.ts`), nunca no
  fuso de quem valida: o editor e o servidor (em UTC) chegam ao mesmo resultado. Início e término inclusos.
- Erros de publicação aparecem por etapa no editor: cada pendência mostra a etapa, a etapa fica em
  vermelho na navegação e há um atalho para ela (`etapaDaMensagem` em `src/lib/eventoEditor.ts`).
- **Capacidade**: a total e a de cada exército nunca ficam abaixo da ocupação atual
  (confirmadas + reservas de pagamento vigentes). Nomes de exército não se repetem.
- Troca de modalidade é auditada.
- **Excluir** só sem inscrições confirmadas ou aguardando pagamento (leva cupons e cortesias junto);
  com vendas, **cancele**. → [`excluirEvento`](api/organizador/excluirEvento.md), [`cancelarEvento`](api/organizador/cancelarEvento.md)
- **Contato no WhatsApp** (opcional):
  - número do organizador: normalizado com DDI (número brasileiro sem DDI ganha 55); **público**,
    vira o botão "Falar com o organizador" na página do evento. Evento novo vem preenchido com o
    telefone da organização.
  - link do grupo: só convites `https://chat.whatsapp.com/<código>`; **só inscritos confirmados e a
    gestão** recebem o link (a visão o remove dos demais, inclusive no HTML do SSR).
- O texto do manual de regras digitado pela organização só vira HTML depois de escapado (`src/lib/regras.ts`).

## 5. Ingressos, lotes e cupons

Código: `src/lib/vendas.ts`.

- Cada **tipo** de ingresso tem preço base e quantidade máxima. O preço de venda vem sempre de um
  **lote** vigente; sem lote vigente com vagas, o tipo está **indisponível** (o preço base nunca é usado como alternativa).
- Motivos de indisponibilidade: nenhum lote configurado, vendas não começaram, período terminou,
  lote inativo, lote esgotado, tipo esgotado.
- **Cupom**: código de 3 a 40 caracteres (letras, números, `-`, `_`), único por evento; desconto
  percentual inteiro de 1 a 100; validade com início e fim opcional; limite de usos opcional;
  vale só para os tipos escolhidos.
  - Situação: `inativo`, `esgotado` (usos ≥ limite), `agendado`, `expirado` ou `ativo`.
  - O uso é contado **na inscrição** (inclusive na reserva) e devolvido se a reserva for liberada.
  - Cupons nunca vão ao navegador; a prévia é feita no servidor. → [`previsualizarCupom`](api/inscricoes/previsualizarCupom.md)
- **Cortesia**: convite gratuito, de uso único, para um e-mail e um tipo de ingresso, com validade.
  Só aquele e-mail resgata; não passa por lote, não aceita cupom nem benefício. Expirada não resgata.

## 6. Inscrição

Código: `confirmarInscricao` em `src/services/inscricoes.ts`. → [API](api/inscricoes/confirmarInscricao.md)

Tudo é verificado **na mesma transação**, sobre dados atuais:

1. evento publicado;
2. menor de idade com autorização aprovada;
3. **uma inscrição confirmada por pessoa e evento** (reforçado por índice único no banco);
4. tipo ativo e exército válido;
5. capacidade do evento, do exército e do tipo (contando confirmadas + reservas vigentes);
6. lote vigente com vagas (ou cortesia válida);
7. cupom **ou** benefício de recompensa (nunca os dois; cortesia não aceita nenhum).

Resultado:
- **Sem valor a pagar** (gratuito, 100% de desconto, cortesia) **ou sem Stripe configurado**:
  inscrição **confirmada** na hora, com token do QR, movimentações e notificação.
- **Com valor a pagar e Stripe configurado**: **reserva** (`pendente`), ver [seção 7](#7-pagamento-online-stripe).
- **Idempotência**: com `clienteId`, reenviar a mesma tentativa devolve a mesma inscrição (e o mesmo
  checkout), sem gastar o cupom duas vezes.
- Uma nova tentativa da mesma pessoa **substitui** a reserva pendente anterior dela (que é
  liberada), salvo se aquele pagamento já estiver em processamento.

### Inclusão manual (pagamento por fora)

Código: `incluirParticipantes` em `src/services/inscricoes.ts`. → [API](api/inscricoes/incluirParticipantes.md)

- Feita pela **gestão do evento** (organização dona ou admin), em Organização › Inscritos ou na
  visão geral do evento no admin (aba Inscrições).
- Só para **conta existente e ativa**. A organização localiza **uma** conta por e-mail ou CPF (ela não
  recebe a lista de usuários); o admin escolhe **várias** pelo nome numa lista com busca (até 50 por vez),
  com o mesmo tipo de ingresso e exército para todas.
- Tudo ou nada: se uma pessoa não puder entrar, ninguém do lote é incluído e o erro diz quem foi.
- Entra como **cortesia já resgatada** (valor zero; aparece em cortesias emitidas/resgatadas, não no bruto).
- Valem as regras 2 a 5 acima (idade, inscrição única, tipo/exército, capacidade); **não** exige lote
  aberto e também vale com o evento em `inscricoes_encerradas`.
- Origem `organizador` ("Inclusão manual") ou `admin` ("Inclusão pela administração"); a ação vai
  para a auditoria (com a observação opcional). Inclusão pelo admin notifica os organizadores do evento.

## 7. Pagamento online (Stripe)

Código: `src/lib/pagamentos.ts`, `src/lib/stripe.ts`, `src/server/pagamentos.server.ts`. → [Fluxo](fluxos.md#3-inscrição-com-pagamento-stripe)

- A reserva segura a **vaga, o uso do cupom e o benefício** por **32 minutos** (o prazo da Checkout
  Session). Ela é liberada por tempo só depois de uma folga de **10 minutos** (o Stripe pode avisar com atraso).
- Estados do pagamento: `aguardando` → `processando` (pagamento assíncrono, ex. boleto) → `pago`;
  ou `expirado` / `falhou` / `cancelado` (reserva liberada sem cobrança); depois de pago,
  `estorno_pendente` → `estornado`.
- **Confirmação**: pelo webhook do Stripe **e** pelo retorno do checkout, ambos idempotentes. Ao
  confirmar, a inscrição ganha o QR, a movimentação de entrada e a notificação.
- Pagamento que chega **depois** de a reserva ser liberada é confirmado se ainda couber; se não
  couber mais ou o evento saiu do ar, é **reembolsado** automaticamente.
- Só a sessão de checkout da própria reserva decide sobre ela (sessões antigas são ignoradas).
- Chamadas ao Stripe nunca acontecem dentro da transação do banco (que pode ser repetida).
- **Contestação (chargeback)**: quando o comprador contesta no banco do cartão, o Stripe avisa e a
  contestação fica registrada no pagamento (`aberta`, `em_analise`, `ganha`, `perdida` ou `encerrada`,
  com valor e motivo). O responsável pela organização é notificado na abertura; aparece em
  Financeiro e nas métricas. A inscrição não é cancelada automaticamente.
- **Sem `STRIPE_SERVER_API_KEY`** no servidor, tudo funciona como antes: confirmação direta, sem cobrança.

## 8. Cancelamento, estorno e reembolso

Código: `cancelarInscricao` (`src/services/inscricoes.ts`), `cancelarEvento` (`src/services/organizador.ts`).

- Quem cancela uma inscrição: o **titular**, a **gestão do evento** ou o **admin**, sempre com motivo.
- Inscrição confirmada → `estornada`: invalida o QR, libera a vaga, registra movimentação de
  estorno (valor negativo), notifica e audita. **Nada é apagado.**
- Paga online: vira `estorno_pendente`; depois de gravar, o servidor cria o **reembolso integral no
  Stripe** (chave de idempotência por inscrição). Falha fica registrada e é tentada de novo a cada webhook.
- Reserva pendente: é **liberada** (sem estorno, pois nada foi cobrado); cupom e benefício voltam e o
  checkout aberto é expirado. Com pagamento em processamento, não pode cancelar até o Stripe responder.
- **Cancelar o evento** estorna todas as confirmadas, libera as reservas, reembolsa no Stripe e
  devolve os benefícios. Exige justificativa.
- Benefício de recompensa usado volta ao participante se ainda estiver dentro do prazo de resgate;
  fora do prazo, fica registrada uma ocorrência para a organização avaliar.

## 9. Repasse às organizações e taxa

Código: `src/lib/repasses.ts`, `src/services/repasses.ts`.

- Cada organização pode ter uma conta **Stripe Connect** com painel Express, criada pela Accounts v2
  como conta recebedora das vendas (a plataforma responde por perdas e taxas, como nas contas Express).
  Situação: `pendente`, `em_analise`, `ativa` ou `restrita`, espelhada do Stripe e visível só para quem gere a organização.
  O site, o ramo (MCC 7922, "Ingressos para eventos") e a descrição do negócio são enviados pela plataforma (`perfilComercialPadrao`),
  então o organizador não precisa informar um site próprio nem escolher o setor no cadastro do Stripe
  (na Accounts v2: `configuration.merchant.mcc` e `defaults.profile`).
- Na reserva, se a conta tem **transferências ativas**, a cobrança nasce com destino a ela: o Stripe
  transfere o valor menos a **taxa da plataforma**. **Sem conta ativa, ingressos pagos
  não são vendidos**: a inscrição mostra ao comprador que a venda ainda não está aberta, e o painel e o
  editor de eventos avisam a organização que ela precisa concluir a conta de recebimento. Inscrições gratuitas e
  cortesias seguem normais.
- A **taxa** (%) é definida pelo admin e vale para reservas novas; cada venda guarda a taxa do momento.
  A organização vê a taxa vigente (só leitura) no Financeiro, com um exemplo do valor que recebe.
- A **taxa de serviço do comprador** (%, padrão 0%) é definida por **cada organização** no Financeiro:
  é somada ao valor do ingresso no checkout como o item "Taxa de serviço", aparece na revisão da
  inscrição e é repassada à organização junto com a venda. Ex.: ingresso de R$ 100,00 com 3,5% do
  comprador e 3,5% da plataforma: o comprador paga R$ 103,50, a organização recebe R$ 100,00 e a
  plataforma R$ 3,50.
- Reembolso de venda repassada desfaz a transferência e devolve a taxa.
- **Uma conta de recebimento por organização**: antes de criar uma conta no Stripe, o servidor procura
  as contas conectadas da plataforma com `metadata.organizacaoId` da organização e reaproveita a que
  existir (a que mais avançou no cadastro, depois a mais antiga). Se duas pessoas criarem ao mesmo tempo,
  vale a primeira gravada e o cadastro continua nela. A administração vê o id da conta de cada
  organização em Pagamentos.
- Ao trocar as chaves do Stripe de teste para produção, a conta de recebimento criada no modo de teste
  (ou numa sandbox, que é outra conta de plataforma) é esquecida na primeira consulta e a organização
  refaz o cadastro numa conta nova. O id descartado fica no log do servidor. Enquanto isso,
  um checkout cujo destino o Stripe não reconhece é recusado até o novo cadastro ficar ativo.
- Mensagens de erro do Stripe mostradas no site nunca trazem a chave de API, nem mascarada.
- Com a conta ativa, o Financeiro mostra **saldo** disponível e a liberar, próximo saque, últimos
  saques, cronograma e banco (só os últimos dígitos), lidos do Stripe com cache de 60 s.
  Com `STRIPE_BROWSER_PUBLIC_KEY`, tudo acontece dentro do site: o cadastro da conta (inclusive o
  inicial), os avisos de pendência e os dados da conta e banco (num painel lateral aberto pelo
  botão "Dados da conta") usam os componentes embutidos do Stripe. Contas Express ainda passam por uma confirmação de e-mail ou
  celular numa janela do Stripe, que só abre depois de um clique do organizador (o navegador
  bloqueia janelas abertas sozinhas); por isso os avisos de pendência aparecem junto dos dados da
  conta ou do cadastro, não ao carregar a página. Sem a chave, cadastro e painel abrem no site do Stripe.
  → [`saldoRecebimento`](api/repasses/saldoRecebimento.md), [`sessaoComponentesStripeOrg`](api/repasses/sessaoComponentesStripeOrg.md)

## 10. Financeiro do evento

Código: `resumoFinanceiro` (`src/services/inscricoes.ts`), `src/lib/movimentacoes.ts`.

- Os valores derivam **só** das inscrições confirmadas e das movimentações; nada é digitado.
  - bruto = soma dos valores das inscrições confirmadas;
  - líquido = bruto − descontos − estornos + ajustes;
  - reservas aguardando pagamento aparecem à parte e **não** entram nos valores.
- Movimentações: `inscricao` (entrada), `desconto_cupom` (registrada com valor 0; o valor real vem
  da inscrição), `estorno` (negativo) e `ajuste`.
- Pagamentos online mostram cobrado, taxa da plataforma, repassado à organização, o que ficou com a plataforma
  e, quando houver, a taxa de serviço paga pelos compradores.
- A tela de movimentações tem abas por tipo, busca (descrição ou código `OP-…`), período, meio de
  pagamento e ordenação; os totais das abas respeitam os filtros.

## 11. Check-in

Código: `src/lib/checkin.ts`, `src/services/checkin.ts`, `src/services/checkinStore.ts`. → [Fluxo](fluxos.md#6-check-in-offline)

- Operam o check-in: organização dona do evento e admin.
- O QR de entrada traz só um **token opaco** (sem CPF, nome ou e-mail), criado na confirmação e nunca trocado.
- Validação: ingresso de outro evento, inscrição não confirmada ou entrada já registrada são recusados.
- Funciona **offline**: o aparelho guarda a base mínima do evento e a fila de operações no IndexedDB,
  separadas, e sincroniza depois.
- Na sincronização, o servidor é **idempotente por id** e marca como **conflito** (com explicação)
  a segunda entrada, a inscrição cancelada antes da sincronização e o ingresso de outro evento.
  Registros de outro operador são recusados.
- Check-in manual exige motivo; desfazer uma entrada exige justificativa.

## 12. Participação, insígnias e recompensas

Código: `src/lib/participacao.ts`, `src/services/progressao.ts`, `src/services/gamificacao.ts`.

- Só dois estados visíveis: **participando** (inscrição confirmada, evento não concluído) e
  **participou** (evento **concluído** + presença válida: check-in ou correção do admin).
  Evento concluído sem presença válida não conta.
- O admin pode **validar** ou **invalidar** a participação de alguém (nunca a própria), com justificativa auditada.
- **Insígnias** (admin): critério por número de operações, de estados (UF), de modalidades ou de missões pré-evento concluídas,
  com meta de 1 a 1000. Concedidas automaticamente.
- **Campanhas de recompensa**: quem conquista a insígnia ganha um benefício (percentual, valor fixo
  ou gratuidade) em eventos da organização que concede. Limite total e por participante, prazos
  `início < conquistar até < resgatar até`. O admin só cria em nome de uma organização com a
  referência da oferta autorizada.
- A concessão (insígnias e vouchers) é **idempotente** (`recalcularProgressao`) e roda depois de
  inscrições, check-ins, correções e ao abrir o próprio perfil.
- **Operações fora da plataforma**: o operador pode registrar no perfil eventos de que participou
  fora do MilSim Ops, com nome, data (já passada), cidade/UF, organização e modalidade opcionais e
  **foto obrigatória**. Aparecem no mapa (listrado) e na lista como "Registrada pelo operador",
  seguem a privacidade do mapa e podem ser ocultadas uma a uma. **Nunca contam para insígnias,
  recompensas nem participação.** No resumo, "Estados na plataforma" fica separado de "N no total".
  → [`salvarOperacaoExterna`](api/perfil/salvarOperacaoExterna.md)

### Missões pré-evento

Código: `src/lib/missoes.ts` (regras puras), `src/services/missoes.ts`. → [APIs](api/README.md#missoes) · [Fluxo](fluxos.md#10-missões-pré-evento)

- A gestão do evento cria missões (rascunho), publica e avalia. Cada missão tem briefing e imagem,
  público (todos ou um exército), tipo de entrega (confirmação, texto/link, **foto** ou **código
  secreto**), pontos (0–10000), abertura opcional, prazo (até o fim do evento) e se exige aprovação.
- **Publicar** avisa uma única vez: post importante em "Avisos oficiais" (missão para todos) ou no
  fórum do exército; missão de um exército nunca é anunciada para o outro.
- **Envio**: só inscrito confirmado do exército de destino, dentro da janela, com a campanha aberta.
  Uma entrega por pessoa por missão; reenvio só com "ajustes solicitados". Código secreto é
  normalizado (sem acentos/maiúsculas), aprova na hora e nunca chega ao navegador do participante.
  O exército da pessoa no envio fica gravado: **os pontos ficam com esse exército**, mesmo se ela trocar.
- **Avaliação**: aprovar (dá os pontos), pedir ajustes ou recusar (com comentário obrigatório).
- **Destaque**: entrega aprovada vai para "Avisos oficiais" **só com autorização do participante**.
- **Placar**: média de pontos por inscrito confirmado do exército (o tamanho do exército não decide)
  + bônus das **metas coletivas** (X% dos inscritos do exército concluíram a missão). Desempate:
  pontos, depois nome. Calculado no servidor; o navegador não recebe as entregas dos outros.
- **Prêmios** por colocação são declarados antes. **Encerrar** exige avaliar as entregas pendentes,
  congela o placar (empate divide a colocação e o prêmio), publica o resultado na comunidade e trava
  tudo. No dia, o **check-in mostra o prêmio** do exército de quem chega.
- **Ranking individual** (top 10 do evento) e **temporada** (soma dos eventos da organização no ano).
- Insígnias podem usar o critério **"missões pré-evento concluídas"**.

## 13. Comunidade

Código: `src/services/comunidade.ts`. → [APIs](api/README.md#comunidade)

- Papéis: **gestão** (organização do evento ou admin) e **membro** (inscrição confirmada).
- **Vitrine pública** (`/comunidades`, link "Comunidades" no menu para todos): mostra que a comunidade
  existe (evento, data, cidade, nº de confirmados), nunca o conteúdo. Lista as comunidades de eventos
  publicados ou com inscrições encerradas que ainda não terminaram, mais as que a pessoa já acessa
  (as dela primeiro). Regras em `src/lib/comunidadePublica.ts` (`acessoAComunidade`):
  - membro ou gestão → entra;
  - visitante → login e, na volta, a mesma decisão;
  - logado sem inscrição e inscrições abertas → página de inscrição com o aviso de que a comunidade é para inscritos;
  - reserva aguardando pagamento → "Concluir pagamento" em Meus ingressos;
  - inscrições encerradas → explicação, sem acesso.
  O mesmo encaminhamento vale para links diretos da comunidade e de publicações.
- Fóruns iniciais, criados ao publicar o evento: Avisos oficiais (só a gestão publica), Conversa
  geral, Dúvidas e preparação, Caronas e logística, Fotos e experiências.
- Cada fórum tem público (`todos` ou um exército) e permissões separadas de publicar e responder
  (`membros` ou `gestao`). Fórum de exército nunca aparece para outro exército; o público não muda
  depois que o fórum tem publicações; publicações só se movem entre fóruns com o mesmo público.
- Limites: texto até **2000** caracteres, até **4** imagens por publicação, 1 por resposta.
- Autor edita e exclui o próprio conteúdo. Publicação com respostas excluída pelo autor fica
  "removida pelo autor" (texto apagado) para a conversa continuar legível.
- Moderação (gestão): fixar, fechar respostas, ocultar com justificativa (nada é apagado), mover,
  arquivar/excluir fórum (só vazio), suspender participante no evento (lê, mas não interage).
  Tudo registrado na moderação.
- Denúncias vão para a gestão do evento, que decide (procedente/descartada).
- Publicação **importante** (só gestão) notifica todos com acesso; comum notifica quem segue o fórum.
- Na comunidade aparece só o **nome de exibição** (até 40 caracteres; padrão: primeiro e último nome).

### Comunidade geral (estilo Twitter)

Código: `src/lib/comunidadeGeral.ts`, `src/lib/moderacao.ts`, `src/server/social.server.ts`, função SQL
`social_posts_page()`. → [APIs](api/README.md#social). Página: Comunidades › Geral (`/comunidades`).

- **Fora da base**: posts, fotos, curtidas, seguidores, bloqueios e denúncias ficam em tabelas `social_*`
  lidas em páginas de 20 (exceção registrada no AGENTS.md). A visibilidade é aplicada no banco.
- **Post**: até **220 caracteres** (emoji conta como 1) e/ou até **4 fotos** (JPG, PNG ou WebP, até 5 MB
  cada, redimensionadas no navegador). Sem vídeo. Respostas são posts ligados a outro post.
- **Ritmo**: no mínimo 10 s entre posts e até 30 por hora por conta.
- **Visibilidade**:
  - perfil **público** (padrão): qualquer pessoa vê, inclusive visitante sem login;
  - perfil **privado**: só o próprio e **seguidores aprovados** (vale também para a ficha do operador); contas de **15 a 17 anos começam privadas**;
  - **bloqueio** (em qualquer sentido) esconde os posts e desfaz o seguir; conta desativada some;
  - post **ocultado** pela moderação ou **excluído** pelo autor não aparece para ninguém.
- **Interagir** (publicar, curtir, responder, seguir, denunciar, bloquear) exige login.
- **Seguir**: perfil público aprova na hora; privado vira pedido (Comunidades › Pedidos para seguir).
  Tornar o perfil público aceita os pedidos pendentes.
- **Conteúdo adulto** (sexo, drogas ilícitas, morte e violência real) é recusado ao publicar por uma lista de
  termos (`moderarTexto`); jargão do jogo ("morri", "missão suicida", "Vale da Morte") passa. **Ainda sem IA**:
  fotos e textos fora da lista dependem de **denúncia**. A IA entra depois no mesmo ponto (`moderarTexto`).
- **Denúncias** vão para o admin (Administração › Comunidade): ocultar a publicação (com motivo, que o autor
  recebe por notificação) encerra todas as denúncias dela; descartar encerra só aquela.
- **Auditoria** (Administração › Comunidade › Últimas publicações): o admin vê todas as publicações e respostas,
  da mais nova para a mais antiga, sem filtro de visibilidade (perfis e fóruns privados, ocultas e removidas pelo
  autor), com o fórum, o nº de denúncias e o motivo da ocultação. Daí pode ocultar (mesma regra das denúncias:
  motivo obrigatório, autor avisado, denúncias pendentes encerradas) ou restaurar uma publicação ocultada.
- **Notificações** (silenciáveis em "comunidade"): resposta ao seu post, pedido para seguir, novo seguidor,
  pedido aceito e publicação ocultada.
- **Fóruns** (Comunidades › Fóruns, `/comunidades/f/…`):
  - qualquer conta cria até **3 fóruns ativos**; nome de 3 a 60 caracteres, único entre os ativos; descrição até 300;
    **foto** opcional (JPG, PNG ou WebP até 5 MB), mostrada na lista e no topo do fórum (o dono troca ou remove);
    nome e descrição passam pela mesma moderação de texto dos posts;
  - **público**: qualquer pessoa (inclusive visitante) lê; entrar é imediato; **privado**: o nome aparece na lista,
    mas só membros aprovados leem posts e membros; entrar vira pedido para o dono e os moderadores;
  - só membros aprovados publicam e respondem; respostas herdam o fórum; posts de fórum **não** aparecem no feed
    geral nem no perfil do autor (fórum público avisa quem tem perfil privado que o post fica visível a todos);
  - **dono**: edita (tornar público aceita os pedidos), arquiva, nomeia/tira moderadores e não pode sair;
    **dono e moderadores**: aprovam pedidos, ocultam posts do fórum (autor notificado) e removem membros
    (moderador remove só membros; ninguém remove o dono); o admin também arquiva e recebe as denúncias;
  - fórum arquivado some da lista e ninguém mais lê.
- **Lateral** (feed, fóruns; no celular, um destaque no topo): `lateralDaComunidade` em `src/lib/divulgacao.ts`:
  - **banners** da página inicial publicados, no período e na região, marcados "exibir também na comunidade";
  - **operações impulsionadas** na posição **"Lateral da comunidade"** (até 3, com o mesmo rodízio); impulsos
    comprados pelas organizações entram nessa posição automaticamente;
  - **patrocinadores** ativos marcados pela administração "destacar na comunidade" (curadoria; venda fica para depois).

## 14. Central de Suporte

Código: `src/lib/suporte.ts`, `src/services/suporte.ts`. → [Fluxo](fluxos.md#7-suporte-com-encaminhamento)

- Chamado sobre um **evento** ou sobre a **plataforma**; categorias Inscrição, Pagamento, Logística,
  Regras, Conta, Funcionamento e Outro. Mensagens até 4000 caracteres; anexo JPEG, PNG, WebP ou PDF até 5 MB.
- **Triagem é só da administração.** A organização do evento só participa quando o admin
  **encaminha** o chamado, e vê apenas o encaminhamento (orientação e anexos compartilhados), nunca
  a conversa com o participante.
- Cada mensagem guarda o seu público (`participante` ou `interno`). O canal interno nunca chega ao participante.
- Status: `aberto` → `em_atendimento` → `aguardando_participante` → `resolvido` → `fechado`.
  Também é exibido "Aguardando organizador" enquanto um encaminhamento espera retorno.
  - aguardar e resolver: só quem atende (admin); resolver exige descrever a solução;
  - reabrir: só de `resolvido` (solicitante ou admin);
  - fechar: solicitante ou admin; **fechado é somente leitura**.
  - Participante em `resolvido` precisa reabrir para escrever.
- Responsável, solução e vínculos são derivados de mensagens "sistema" **imutáveis** (o histórico nunca é reescrito).
- Envios com `clienteId` não duplicam. Anexos ficam no bucket privado, abertos por link assinado
  depois de conferir o acesso; imagens aparecem dentro da conversa (o link é pedido quando a imagem chega
  perto da tela) e abrem ampliadas com opção de baixar, PDFs abrem em outra aba. O "lido até" de cada pessoa fica no servidor (vale em todos os aparelhos).

## 15. Página inicial, divulgação e impulsionamento

Código: `src/lib/divulgacao.ts`, `src/lib/impulsionamento.ts`.

- Só eventos **publicados e não encerrados** aparecem na página inicial.
- Seções (admin): destaques, regional, patrocinadores, apoiadores e banner; cada uma com
  abrangência (nacional, região, estado ou cidade), agendamento e curadoria manual ou seleção
  automática. A elegibilidade é recalculada a cada carregamento (não há agendador).
- "Operações em destaque" vem acima de qualquer outra lista da página inicial: primeiro o bloco de
  impulsos da listagem, depois as seções do tipo destaques; só então "Operações para você", a
  listagem comum e as demais seções.
- Links de parceiros: só http/https; Instagram normalizado para `https://www.instagram.com/<perfil>/`;
  WhatsApp com DDI. Imagens precisam de texto alternativo.
- **Impulsionamento** (admin): o evento ganha prioridade em seções escolhidas, num período e numa região.
  - Estado exibido: rascunho, agendado, ativo, pausado, pausado por esgotar (objetivo inscrições),
    suspenso (evento fora do ar) ou encerrado.
  - Campanhas entram antes da curadoria, ordenadas por prioridade e ordem; cada evento aparece **uma vez** por seção.
  - **Rodízio dos impulsos comprados**: as campanhas da administração vêm primeiro; depois, no máximo
    **8** impulsos comprados por bloco (seção ou listagem). Eventos da área escolhida pelo visitante têm
    preferência e, entre eles, a ordem é sorteada por visitante e muda a cada 15 minutos (00, 15, 30 e 45 de cada hora), para
    que todos os organizadores que pagaram tenham chances parecidas. Na listagem, só disputam as vagas os
    eventos que atendem à busca e aos filtros.
  - Campanhas nunca são apagadas; encerrada não é editada.
- **Impulsos comprados** (organização): `src/lib/impulsos.ts`, página `/organizacao/impulsos`.
  - Seis tipos: 24h, 3, 5, 7, 15 e 30 dias. Preço, validade (padrão 30 dias) e venda de cada tipo
    são definidos pela administração em **Loja da plataforma** (`/admin/loja`, seção Impulsos de operações);
    a compra guarda os valores do momento.
  - Cada tipo tem imagem (padrão tema airsoft em `public/impulsos`, trocável pela administração) e é um
    produto do catálogo do Stripe da plataforma (`milsim_impulso_<tipo>`), atualizado ao salvar; valor novo
    gera preço novo e arquiva o antigo.
  - Só o organizador ativo compra, para a própria organização; o pagamento (Stripe Checkout) fica todo
    com a plataforma. Preço 0 libera na hora. Checkout não pago em 60 minutos é descartado.
  - Pago, o impulso fica no saldo da organização e precisa ser usado até `pagamento + validade`;
    depois disso aparece como **expirado** e não pode mais ser usado.
  - Usar = escolher uma operação publicada, não encerrada e com imagem: vira uma campanha ativa nas
    seções de destaque, no topo da listagem e na lateral da comunidade, em todo o Brasil, com prioridade normal. Um segundo impulso
    na mesma operação começa quando o anterior termina; o impulso termina no máximo no fim da operação.
  - Reembolso integral no Stripe cancela o impulso e encerra a campanha. A organização vê as próprias
    compras sem os ids do Stripe; o público não vê compras nem qual campanha veio de um impulso.

## 16. Métricas

Código: `src/services/analytics.ts`, `src/server/analytics.server.ts`, `src/lib/analytics.ts`.

- Coleta **anônima**: só ids aleatórios (visitante, sessão, fluxo). Nunca nome, e-mail, CPF, telefone,
  endereço, exército, pagamento ou texto digitado.
- Admin e a própria organização **não** entram na coleta dos seus eventos (o servidor reaplica a exclusão).
- O servidor descarta eventos inexistentes, campanhas de outro evento e horários fora das últimas 24 h.
- Fórmulas: CTR = cliques ÷ exibições; conversão = visitantes com inscrição confirmada ÷ visitantes
  únicos; conclusão = fluxos concluídos ÷ fluxos iniciados.
- Campanhas de rastreio (`?cmp=<id>`) por evento, criadas pela gestão.

### Visão geral do evento (admin)

Código: `src/lib/visaoGeralEvento.ts`, página `/admin/eventos/$eventoId` (botão "Ver" do dashboard).

- Só leitura, a partir da visão do admin (sem API própria).
- Vendidos = inscrições **confirmadas** (sobre a capacidade); aguardando pagamento = reservas vigentes
  (`reservaVigente`); cancelados e estornados contados à parte; por tipo de ingresso e por exército.
- Check-in = confirmadas com entrada vigente (`entradaAtiva`: sem reversão nem conflito).
- Pagamentos online: pagos, reembolsados, reembolsos pendentes e contestações em aberto (`disputaEmAberto`).
- Suporte: chamados com `eventoId` do evento, por status exibido; "em aberto" = não resolvido nem fechado.
- Valores em dinheiro vêm do Financeiro do evento ([seção 10](#10-financeiro-do-evento)), sem fórmula própria.

## 17. Notificações

- Notificações são internas (sino). Não há e-mail transacional nem WhatsApp automático.
- A pessoa pode silenciar todas ou só as da comunidade, e seguir ou silenciar fóruns.
- Participante e organizador marcam como lidas só as próprias; o admin pode marcar qualquer uma.

## 18. Privacidade e dados pessoais

- O navegador recebe só a visão da pessoa:
  - inscrições de terceiros chegam **anônimas** (sem titular, código ou token), só para contar vagas;
  - usuários: a própria conta; dos autores da comunidade, só o perfil público (sem CPF, e-mail,
    telefone ou endereço); a gestão vê os dados dos inscritos dos próprios eventos;
  - cupons, movimentações e check-ins: só a gestão do evento;
  - link do grupo do WhatsApp: só inscritos confirmados e a gestão.
- **Notas fiscais** de equipamentos: bucket privado, **só o dono** acessa (nem organizador, nem admin),
  por link assinado de 60 s. Nunca entram na visão nem no perfil.
- Perfil do operador: cada bloco é `eu` ou `autenticados`; visitante deslogado vê só nome e foto.
- Perfil **privado** (Comunidades): os blocos `autenticados` (visão geral, operações, mapa, insígnias, equipamentos,
  fotos) e as publicações só aparecem para **seguidores aprovados**; quem não segue (ou aguarda aprovação) vê só nome
  e foto. Bloqueio entre as contas fecha o perfil. Blocos `eu` continuam só do dono, mesmo para seguidores.
- Solicitações LGPD (acesso, correção, exportação, exclusão) vão para os admins, que respondem pela plataforma.
- Listagens da gestão mostram CPF e telefone mascarados.
- **Cifra no banco**: nome completo, CPF, data de nascimento, e-mail e WhatsApp da conta, endereço,
  ficha de emergência, CNPJ e telefone de organizações e pedidos de organizador, e nome/e-mail de
  convidados de cortesia ficam gravados cifrados (AES-256-GCM, `src/server/cifraDados.ts`). Só o
  servidor, com `PERSONAL_DATA_ENCRYPTION_KEY`, lê esses valores; o que cada pessoa vê continua
  decidido pela visão. CPF e e-mail seguem únicos (índice cego). Sem a chave, nenhuma gravação que
  envolva esses dados é aceita.
- **Ficha de emergência** (opcional: tipo sanguíneo, alergias, contato de emergência; `src/lib/fichaEmergencia.ts`):
  dado de saúde (LGPD, art. 11). Preenchida no cadastro ou em Meu perfil › Ficha de emergência; vazia = removida.
  - O titular sempre vê e edita.
  - A organização dona do evento e o admin só veem com a **autorização explícita** (guardada com data), inscrição
    **confirmada** e de **7 dias antes do início até o fim** do evento — no detalhe do inscrito e no check-in
    (inclusive offline). Fora disso a ficha nem chega ao navegador (filtrada na visão, mesmo para o admin).
  - Contas existentes receberam uma notificação para preencher (migration `20261022100000_ficha_emergencia`).
- **CEP** (cadastro e local do evento): ao completar 8 dígitos, o navegador consulta o ViaCEP
  (`consultarCep` em `src/services/geolocalizacao.ts`) enviando só o CEP, e preenche endereço, bairro,
  cidade e UF; os campos continuam editáveis e o CEP com que o formulário abriu não é reconsultado.

## 19. Lacunas conhecidas

| Ponto | Situação | Impacto |
|---|---|---|
| Encerramento de inscrições | Nada muda o evento para `inscricoes_encerradas` nem `arquivado` automaticamente (a conclusão no término já é automática). | Sem impacto na participação; as vendas já fecham pelo período dos lotes. |
| Exclusão de contas | Não há exclusão definitiva nem em massa; só desativação. | Pedido em andamento: exclusão em massa com backup restaurável por 6 meses. |
| Mensagens externas | Sem e-mail transacional nem WhatsApp automático. | Avisos só pelo sino. |
| Storage | Arquivos substituídos ou de dados removidos não são apagados. | Ocupa espaço; sem dado sensível exposto (bucket privado protegido). |
| APIs legadas | `abrirChamado`/`responderChamado` (`conta`) não são usadas pelas telas. | Candidatas a remoção. |
