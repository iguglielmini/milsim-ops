// Edição dos dados da própria conta: o que muda, o que nunca muda (CPF, e-mail, termos) e o
// efeito da data de nascimento na autorização do responsável.
import { describe, it, expect, beforeEach } from "vitest";
import { restaurarBase } from "@/test/baseTeste";
import { atualizarDadosConta, type DadosConta } from "@/services/conta";
import type { BaseDados, Usuario } from "@/lib/domain/types";

let base: BaseDados;
let u: Usuario;

const dataComIdade = (anos: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos, d.getMonth(), d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const dados = (extra: Partial<DadosConta> = {}): DadosConta => ({
  nomeCompleto: "  Novo   Nome  ",
  dataNascimento: dataComIdade(30),
  whatsapp: "(83) 99999-1234",
  cep: "58000-000",
  logradouro: "Rua Nova",
  numero: "10",
  complemento: "",
  bairro: "Centro",
  cidade: "João Pessoa",
  uf: "pb",
  instagram: " @novo ",
  squad: "",
  ...extra,
});

beforeEach(() => {
  base = restaurarBase();
  u = base.usuarios.find((x) => x.perfil === "participante")!;
});

describe("dados da conta", () => {
  it("atualiza os campos editáveis normalizados e não toca em CPF, e-mail e termos", () => {
    const { cpf, email, aceiteTermosVersao, aceiteTermosEm } = u;
    atualizarDadosConta(u, dados());
    expect(u.nomeCompleto).toBe("Novo Nome");
    expect(u.whatsapp).toBe("83999991234");
    expect(u.endereco).toEqual({ cep: "58000000", logradouro: "Rua Nova", numero: "10", complemento: undefined, bairro: "Centro", cidade: "João Pessoa", uf: "PB" });
    expect(u.instagram).toBe("@novo");
    expect(u.squad).toBeUndefined();
    expect({ cpf: u.cpf, email: u.email, aceiteTermosVersao: u.aceiteTermosVersao, aceiteTermosEm: u.aceiteTermosEm })
      .toEqual({ cpf, email, aceiteTermosVersao, aceiteTermosEm });
  });

  it.each([
    [{ nomeCompleto: "  " }, /nome completo/],
    [{ dataNascimento: "2000-13-40" }, /data de nascimento válida/],
    [{ dataNascimento: dataComIdade(14) }, /ao menos 15 anos/],
    [{ whatsapp: "1234" }, /WhatsApp inválido/],
    [{ cep: "123" }, /CEP válido/],
    [{ uf: "XX" }, /estado/],
    [{ bairro: " " }, /logradouro, número, bairro e cidade/],
  ])("recusa %o", (extra, msg) => {
    const antes = structuredClone(u);
    expect(() => atualizarDadosConta(u, dados(extra))).toThrow(msg);
    expect(u).toEqual(antes); // nada muda quando a validação falha
  });

  it("passar a ser menor de 18 pede autorização do responsável e deixa a comunidade privada", () => {
    u.autorizacaoResponsavel = "nao_aplicavel";
    u.comunidadePrivada = undefined;
    atualizarDadosConta(u, dados({ dataNascimento: dataComIdade(16) }));
    expect(u.autorizacaoResponsavel).toBe("pendente");
    expect(u.comunidadePrivada).toBe(true);
  });

  it("autorização já aprovada continua aprovada enquanto menor; maior de idade fica sem autorização", () => {
    u.dataNascimento = dataComIdade(16);
    u.autorizacaoResponsavel = "aprovada";
    atualizarDadosConta(u, dados({ dataNascimento: dataComIdade(17) }));
    expect(u.autorizacaoResponsavel).toBe("aprovada");
    atualizarDadosConta(u, dados({ dataNascimento: dataComIdade(20) }));
    expect(u.autorizacaoResponsavel).toBe("nao_aplicavel");
  });

  it("sem mudar a data de nascimento, a autorização não é recalculada", () => {
    u.autorizacaoResponsavel = "pendente";
    atualizarDadosConta(u, dados({ dataNascimento: u.dataNascimento }));
    expect(u.autorizacaoResponsavel).toBe("pendente");
  });
});
