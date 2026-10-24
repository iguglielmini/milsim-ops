import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { obterPerfil } from "@/api/perfil.functions";
import { MapaBrasil } from "@/components/perfil/MapaBrasil";
import { OperacoesExternas } from "@/components/perfil/OperacoesExternas";
import { AbaEquipamentos, AbaInsignias, AbaOperacoes, AbaRecompensas, Restrito } from "@/components/perfil/abas";
import { EditarPerfil, Privacidade } from "@/components/perfil/edicao";
import { CompartilharPerfil } from "@/components/perfil/CompartilharPerfil";
import { CartaoFichaEmergencia } from "@/components/perfil/FichaEmergencia";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Campo, ErroSecao, SkeletonPagina } from "@/components/ui";

const ABAS = ["perfil", "emergencia", "equipamentos", "operacoes", "insignias", "privacidade"] as const;
type Aba = (typeof ABAS)[number];
const ROTULOS: Record<Aba, string> = { perfil: "Meu perfil", emergencia: "Ficha de emergência", equipamentos: "Meus equipamentos", operacoes: "Operações e mapa", insignias: "Insígnias e recompensas", privacidade: "Privacidade" };
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { formatarDataBR } from "@/lib/domain/money";
import { mascaraCep, mascararCpf, mascararTelefone } from "@/lib/domain/validators";
import { EditarDadosConta } from "@/components/perfil/EditarDadosConta";
import { Pencil } from "lucide-react";
import { NomeExibicaoForm } from "@/components/NomeExibicaoForm";
import { FotoPerfil } from "@/components/FotoPerfil";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { OpcoesModalidade, useSelecaoModalidades } from "@/components/PreferenciasModalidade";
import { usePreferencias } from "@/contexts/PreferenciasContext";
import { nomeModalidade } from "@/lib/modalidades";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/app/perfil")({
  validateSearch: (s: Record<string, unknown>) => ({
    aba: ABAS.includes(s["aba"] as Aba) ? (s["aba"] as Aba) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Perfil — MilSim Ops" },
      { name: "description", content: "Seus dados de perfil e preferências." },
      { property: "og:title", content: "Perfil — MilSim Ops" },
      { property: "og:description", content: "Perfil e preferências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Perfil,
});

function Perfil() {
  const { usuario } = useAuth();
  const { aba: abaUrl } = Route.useSearch();
  const router = useRouter();
  const aba: Aba = abaUrl ?? "perfil";
  const irPara = (a: Aba) => router.navigate({ to: "/app/perfil", search: { aba: a }, replace: true, resetScroll: false });
  if (!usuario) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold uppercase">Meu perfil</h1>
        <div className="flex flex-wrap items-start gap-2">
          <Link to="/operador/$usuarioId" params={{ usuarioId: usuario.id }} search={{ aba: undefined }}><Button variant="outline">Ver perfil público</Button></Link>
          <CompartilharPerfil usuarioId={usuario.id} />
        </div>
      </div>
      <div className="sm:hidden">
        <Label htmlFor="aba-meu-perfil" className="sr-only text-[length:inherit] font-normal text-inherit">Seção</Label>
        <NativeSelect id="aba-meu-perfil" value={aba} onChange={(e) => irPara(e.target.value as Aba)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          {ABAS.map((a) => <option key={a} value={a}>{ROTULOS[a]}</option>)}
        </NativeSelect>
      </div>
      <Tabs value={aba} onValueChange={(v) => irPara(v as typeof aba)}>
        <TabsList aria-label="Seções do meu perfil" className="hidden flex-wrap gap-1 border-b border-border sm:flex">
          {ABAS.map((a) => (
            <TabsTrigger key={a} value={a}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${aba === a ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {ROTULOS[a]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div role="tabpanel" aria-label={ROTULOS[aba]}>
        {aba === "perfil" ? <DadosConta /> : aba === "emergencia" ? <CartaoFichaEmergencia ficha={usuario.fichaEmergencia} /> : <GestaoPerfil aba={aba} usuarioId={usuario.id} />}
      </div>
    </div>
  );
}

function GestaoPerfil({ aba, usuarioId }: { aba: Exclude<Aba, "perfil">; usuarioId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["perfil-operador", usuarioId, usuarioId], queryFn: () => obterPerfil(usuarioId) });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["perfil-operador", usuarioId] });
  const [editar, setEditar] = useState(false);
  const [priv, setPriv] = useState(false);
  if (q.isPending) return <SkeletonPagina />;
  if (q.isError || !q.data) return <ErroSecao titulo="Perfil indisponível" onTentar={() => q.refetch()} />;
  const p = q.data;
  if (aba === "equipamentos") return <AbaEquipamentos equipamentos={p.equipamentos} proprio onMudou={recarregar} />;
  if (aba === "operacoes") return (
    <div className="space-y-6">
      <AbaOperacoes operacoes={p.operacoes} futuras={p.futuras} proprio onMudou={recarregar} />
      {p.mapa ? <MapaBrasil operacoes={p.mapa} externas={p.externas} /> : <Restrito />}
      <OperacoesExternas externas={p.externas} proprio onMudou={recarregar} />
    </div>
  );
  if (aba === "insignias") return (
    <div className="space-y-6">
      <AbaInsignias insignias={p.insignias} />
      {p.recompensas && <section><h2 className="mb-2 font-display text-lg font-semibold uppercase">Minhas recompensas</h2><AbaRecompensas recompensas={p.recompensas} /></section>}
    </div>
  );
  return (
    <Card>
      <h2 className="font-display text-lg font-semibold uppercase">Privacidade do perfil</h2>
      <p className="mt-1 text-sm text-muted-foreground">Escolha o que outras pessoas veem: histórico, mapa, insígnias, equipamentos e fotos. Notas fiscais nunca são públicas.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setPriv(true)}>Configurar privacidade</Button>
        <Button variant="outline" onClick={() => setEditar(true)}>Editar perfil social</Button>
      </div>
      {priv && <Privacidade perfil={p} aberto onFechar={() => setPriv(false)} onSalvo={recarregar} />}
      {editar && <EditarPerfil perfil={p} aberto onFechar={() => setEditar(false)} onSalvo={recarregar} />}
    </Card>
  );
}

function DadosConta() {
  const { usuario } = useAuth();
  const { tema, definirTema } = useTheme();
  const [editando, setEditando] = useState(false);
  if (!usuario) return null;
  const [a, m, d] = usuario.dataNascimento.split("-");
  const end = usuario.endereco;
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold uppercase">Meus dados</h2>
          <Button variant="outline" onClick={() => setEditando(true)}><Pencil className="h-4 w-4" aria-hidden="true" /> Editar dados</Button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Nome</dt><dd>{usuario.nomeCompleto}</dd></div>
          <div><dt className="text-muted-foreground">E-mail</dt><dd>{usuario.email}</dd></div>
          <div><dt className="text-muted-foreground">CPF</dt><dd>{mascararCpf(usuario.cpf)}</dd></div>
          <div><dt className="text-muted-foreground">Nascimento</dt><dd>{`${d}/${m}/${a}`}</dd></div>
          <div><dt className="text-muted-foreground">WhatsApp</dt><dd>{mascararTelefone(usuario.whatsapp)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Endereço</dt><dd>{end.logradouro}, {end.numero}{end.complemento ? ` — ${end.complemento}` : ""} · {end.bairro} · {end.cidade}/{end.uf} · CEP {mascaraCep(end.cep)}</dd></div>
          {usuario.squad && <div><dt className="text-muted-foreground">Squad</dt><dd>{usuario.squad}</dd></div>}
          {usuario.instagram && <div><dt className="text-muted-foreground">Instagram</dt><dd>{usuario.instagram}</dd></div>}
          <div><dt className="text-muted-foreground">Aceite dos termos</dt><dd>{usuario.aceiteTermosVersao} em {formatarDataBR(usuario.aceiteTermosEm)}</dd></div>
        </dl>
        {editando && <EditarDadosConta usuario={usuario} aberto onFechar={() => setEditando(false)} />}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-semibold uppercase">Foto</h2>
        <div className="mt-3"><FotoPerfil /></div>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-semibold uppercase">Configurações</h2>
        <div className="mt-3"><NomeExibicaoForm /></div>
        <div className="mt-3 max-w-xs">
          <Campo rotulo="Aparência" htmlFor="tema">
            <NativeSelect id="tema" value={tema} onChange={(e) => definirTema(e.target.value as "dark" | "light")}>
              <option value="dark">Escuro — Verde-oliva</option>
              <option value="light">Claro — TAN</option>
            </NativeSelect>
          </Campo>
        </div>
      </Card>
      <PreferenciasEventos />
    </div>
  );
}

function PreferenciasEventos() {
  const p = usePreferencias();
  const { sel, setSel, alternar } = useSelecaoModalidades([]);
  useEffect(() => { setSel(p.preferencia.modalidades); }, [p.preferencia, setSel]);
  const atual = p.preferencia.estado === "selecionadas" ? p.preferencia.modalidades.map(nomeModalidade).join(", ")
    : p.preferencia.estado === "todas" ? "Explorar todas" : "Ainda não escolhidas";
  return (
    <Card>
      <h2 className="font-display text-lg font-semibold uppercase">Preferências de eventos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Atual: {atual}. Suas favoritas aparecem primeiro em “Para você”, sem esconder as demais. Salvo nesta conta, neste navegador.</p>
      {p.montado && (
        <>
          <div className="mt-3"><OpcoesModalidade selecionadas={sel} onAlternar={alternar} nome="perfil-mod" /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!sel.length} onClick={() => p.salvar(sel)}>Salvar preferências</Button>
            <Button variant="secondary" onClick={p.explorarTodas}>Explorar todas</Button>
          </div>
        </>
      )}
    </Card>
  );
}
