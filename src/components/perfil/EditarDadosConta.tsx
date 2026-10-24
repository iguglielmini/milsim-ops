// Edição dos dados da própria conta (Meu perfil). CPF e e-mail aparecem bloqueados: são a
// identidade da conta. Regras no servidor (atualizarDadosConta, src/services/conta.ts).
import { useState } from "react";
import { Lock } from "lucide-react";
import { atualizarDadosConta } from "@/api/conta.functions";
import { textoBuscaCep, useBuscaCep } from "@/hooks/useBuscaCep";
import { NOMES_UF } from "@/lib/localizacao";
import { mascaraCep, mascaraTelefone, mascararCpf } from "@/lib/domain/validators";
import type { Usuario } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Campo, Modal } from "@/components/ui";

const UFS = Object.keys(NOMES_UF).sort((a, b) => NOMES_UF[a]!.localeCompare(NOMES_UF[b]!));

const inicial = (u: Usuario) => ({
  nomeCompleto: u.nomeCompleto,
  dataNascimento: u.dataNascimento,
  whatsapp: mascaraTelefone(u.whatsapp),
  cep: mascaraCep(u.endereco.cep),
  logradouro: u.endereco.logradouro,
  numero: u.endereco.numero,
  complemento: u.endereco.complemento ?? "",
  bairro: u.endereco.bairro,
  cidade: u.endereco.cidade,
  uf: u.endereco.uf,
  instagram: u.instagram ?? "",
  squad: u.squad ?? "",
});

function Bloqueado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{rotulo}</p>
      <p className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{valor}</span>
      </p>
    </div>
  );
}

export function EditarDadosConta({ usuario, aberto, onFechar }: { usuario: Usuario; aberto: boolean; onFechar: () => void }) {
  const [f, setF] = useState(() => inicial(usuario));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  // CEP alterado preenche o endereço (como no cadastro); o hook ignora o CEP com que o formulário abriu.
  const buscaCep = useBuscaCep(f.cep, (r) =>
    setF((p) => ({ ...p, logradouro: r.logradouro || p.logradouro, bairro: r.bairro || p.bairro, cidade: r.cidade || p.cidade, uf: r.uf || p.uf })),
  );

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await atualizarDadosConta({ ...f, complemento: f.complemento || undefined, instagram: f.instagram || undefined, squad: f.squad || undefined });
      onFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} titulo="Editar meus dados" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bloqueado rotulo="CPF" valor={mascararCpf(usuario.cpf)} />
          <Bloqueado rotulo="E-mail" valor={usuario.email} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
            CPF e e-mail identificam a sua conta e não podem ser alterados aqui. Para corrigi-los, abra um chamado no suporte.
          </p>
          <div className="sm:col-span-2">
            <Campo rotulo="Nome completo" htmlFor="conta-nome">
              <Input id="conta-nome" autoComplete="name" value={f.nomeCompleto} onChange={set("nomeCompleto")} required />
            </Campo>
          </div>
          <Campo rotulo="Data de nascimento" htmlFor="conta-nasc">
            <Input id="conta-nasc" type="date" value={f.dataNascimento} onChange={set("dataNascimento")} required />
          </Campo>
          <Campo rotulo="WhatsApp" htmlFor="conta-whats">
            <Input id="conta-whats" inputMode="tel" autoComplete="tel" value={f.whatsapp} onChange={(e) => setF((p) => ({ ...p, whatsapp: mascaraTelefone(e.target.value) }))} placeholder="(11) 99999-9999" required />
          </Campo>
          <Campo rotulo="CEP" htmlFor="conta-cep">
            <Input id="conta-cep" inputMode="numeric" autoComplete="postal-code" value={f.cep} onChange={(e) => setF((p) => ({ ...p, cep: mascaraCep(e.target.value) }))} placeholder="00000-000" required />
            {textoBuscaCep(buscaCep) && (
              <p aria-live="polite" className={`text-xs ${buscaCep.status === "erro" ? "text-destructive" : "text-muted-foreground"}`}>{textoBuscaCep(buscaCep)}</p>
            )}
          </Campo>
          <Campo rotulo="Logradouro" htmlFor="conta-logr">
            <Input id="conta-logr" autoComplete="address-line1" value={f.logradouro} onChange={set("logradouro")} required />
          </Campo>
          <Campo rotulo="Número" htmlFor="conta-num">
            <Input id="conta-num" value={f.numero} onChange={set("numero")} required />
          </Campo>
          <Campo rotulo="Complemento (opcional)" htmlFor="conta-comp">
            <Input id="conta-comp" autoComplete="address-line2" value={f.complemento} onChange={set("complemento")} />
          </Campo>
          <Campo rotulo="Bairro" htmlFor="conta-bairro">
            <Input id="conta-bairro" value={f.bairro} onChange={set("bairro")} required />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="conta-cidade">
            <Input id="conta-cidade" autoComplete="address-level2" value={f.cidade} onChange={set("cidade")} required />
          </Campo>
          <Campo rotulo="UF / Estado" htmlFor="conta-uf">
            <NativeSelect id="conta-uf" value={f.uf} onChange={set("uf")} required>
              <option value="">Selecione</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf} — {NOMES_UF[uf]}</option>)}
            </NativeSelect>
          </Campo>
          <Campo rotulo="Instagram (opcional)" htmlFor="conta-insta">
            <Input id="conta-insta" value={f.instagram} onChange={set("instagram")} placeholder="@seuperfil" />
          </Campo>
          <Campo rotulo="Squad (opcional)" htmlFor="conta-squad">
            <Input id="conta-squad" value={f.squad} onChange={set("squad")} />
          </Campo>
        </div>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </form>
    </Modal>
  );
}
