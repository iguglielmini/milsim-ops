# `atualizarDadosConta`

[← Índice de APIs](../README.md) · Módulo: [Conta](../README.md#conta)

| | |
|---|---|
| Server function | `atualizarDadosContaFn` em [`src/api/conta.functions.ts`](../../../src/api/conta.functions.ts) |
| Uso no navegador | `atualizarDadosConta(…)` |
| Método | `POST` |
| Acesso | Qualquer pessoa autenticada e ativa (só a própria conta) |

Atualiza os dados da própria conta em Meu perfil › Editar dados. **CPF, e-mail e aceite dos termos não mudam por aqui**: não fazem parte da entrada (campos extras são recusados) e a correção deles é pedida ao suporte.

## Entrada

| Campo | Tipo | Observação |
|---|---|---|
| `nomeCompleto` | string (até 150) | Espaços extras são removidos. |
| `dataNascimento` | string `AAAA-MM-DD` | Idade mínima de 15 anos. |
| `whatsapp` | string | 10 ou 11 dígitos (máscara aceita). |
| `cep` | string | 8 dígitos (máscara aceita). |
| `logradouro`, `numero`, `bairro`, `cidade` | string | Obrigatórios. |
| `complemento?` | string | Vazio remove. |
| `uf` | string (2) | Sigla de um estado. |
| `instagram?`, `squad?` | string | Opcionais; vazio remove. |

## Regras

- Mesmas validações do cadastro (`atualizarDadosConta`, `src/services/conta.ts`); nada é gravado se algum campo falhar.
- Mudar a data de nascimento recalcula a autorização do responsável: menor de 18 fica `pendente` (salvo se já `aprovada`) e o perfil da comunidade passa a privado; 18 ou mais fica `nao_aplicavel`.
- Os dados pessoais são gravados cifrados (`COLUNAS_CIFRADAS`), como no cadastro.

## Resposta

`void` (a visão volta atualizada).

## Erros

Mensagens que chegam ao navegador em `error.message` (regras de negócio):

- Informe o nome completo.
- Informe uma data de nascimento válida.
- É necessário ter ao menos 15 anos.
- Telefone/WhatsApp inválido.
- Informe um CEP válido.
- Selecione o estado.
- Preencha logradouro, número, bairro e cidade.
- Entre na sua conta para continuar.

## Exemplo

```ts
import { atualizarDadosConta } from "@/api/conta.functions";

await atualizarDadosConta({
  nomeCompleto: "Italo G.",
  dataNascimento: "1990-05-20",
  whatsapp: "(83) 99999-1234",
  cep: "58000-000",
  logradouro: "Rua Nova",
  numero: "10",
  bairro: "Centro",
  cidade: "João Pessoa",
  uf: "PB",
});
```
