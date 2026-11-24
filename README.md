# Marília Mendes — Terapias Manuais

Site estático mantido no Codex, versionado no GitHub e publicado pela Cloudflare Pages.

- Repositório: https://github.com/elevorapt-create/mmterapiasmanuais
- Alojamento: https://mmterapiasmanuais.pages.dev/
- Domínio final: https://mariliamendesterapiasmanuais.pt/
- Saída de publicação: `dist`, ramo `main`, sem compilação no alojamento.

## Conteúdo

As seis fotografias reais foram selecionadas e aprovadas pelo gestor. O gestor confirmou a autorização de utilização da imagem da profissional e da pessoa em atendimento, incluindo a disponibilização no repositório público. As variantes WebP responsivas preservam os enquadramentos das fotografias de origem. Não incluir novos originais de alta resolução no repositório.

`build_content.py` gera as páginas HTML e os ficheiros SEO. Executar a partir da raiz do projeto com Python em UTF-8 (`python -X utf8 build_content.py`). CSS, JavaScript e recursos ficam em `dist`. Não substituir variantes `real-*` pelas imagens provisórias anteriores.

## CRM

Em `/admin` pode registar leads e serviços, ver o pipeline, agendar sessões e acompanhar datas de seguimento. As etapas são **Novo lead → Conversa iniciada → Em seguimento → Agendamento feito → Sessão realizada**, com **Encerrado** para contactos que deixaram de avançar. As alterações de etapa e qualificação ficam no histórico do contacto.

A qualificação indica a intenção de marcação. Use **Por qualificar** quando faltam dados, **Frio** para interesse genérico, **Morno** para pedidos de informação ou preço e **Quente** para pedidos de disponibilidade ou intenção concreta de marcar. O registo manual aceita a origem do contacto e os cinco campos UTM para atribuição de campanha. A ligação a um futuro formulário do site deve ser feita no servidor, mantendo a API de administração autenticada.

Arraste os cartões entre colunas no computador ou mude a etapa na edição do lead. Os cartões mostram o preço registado ao associar o serviço. O painel soma separadamente os valores dos agendamentos feitos e das sessões realizadas, incluindo todos os leads dessas etapas. Pode excluir um lead e o respetivo histórico, ou excluir um serviço do catálogo mantendo o preço e o nome nos leads que já o utilizavam.

A área **Clientes** reúne os contactos que já passaram por agendamento ou sessão realizada. Pode pesquisar por nome, telefone ou e-mail e abrir o registo pelo nome. A data de agendamento só é usada em **Agendamento feito** e **Sessão realizada** e deve ser indicada manualmente. Ao arrastar um lead para agendamento a partir de outra etapa, a data fica por preencher.

Registe a data e hora do primeiro contacto na edição do lead. Na ficha de cliente, pode acrescentar sessões e consultar o histórico de agendamentos. As sessões adicionais podem ser marcadas como realizadas ou canceladas na própria ficha. Os agendamentos ligados ao cartão são geridos pelo pipeline.

### Executar localmente

Use Node.js 22 ou superior. Crie na raiz um ficheiro privado `.dev.vars` com `CRM_ADMIN_PASSWORD` (escolha uma palavra-passe para desenvolvimento) e `CRM_SESSION_SECRET` (gere um valor aleatório com `openssl rand -hex 32`). A palavra-passe é o acesso a uma conta de administração. A sessão expira ao fim de oito horas.

```sh
npx --yes wrangler@4.167.0 d1 migrations apply CRM_DB --local --config wrangler.local.jsonc
npx --yes wrangler@4.167.0 pages dev dist --d1 CRM_DB=00000000-0000-4000-8000-000000000001 --compatibility-date 2025-04-01 --port 8788
```

Abra `http://localhost:8788/admin`. O Wrangler serve as páginas e a API e persiste o D1 local em `.wrangler/state`. O servidor HTTP do Python continua disponível para trabalhar nas páginas públicas.

### Ativar no Cloudflare Pages

1. Crie uma base D1 e aplique os ficheiros de `migrations/` por ordem. A partir de uma sessão autenticada na conta Cloudflare, execute `npx --yes wrangler@4.167.0 d1 execute NOME_DA_BASE --remote --file CAMINHO_DA_MIGRAÇÃO` para cada migração em falta.
2. Nas definições do projeto Pages, associe a base à binding `CRM_DB` e adicione os segredos encriptados `CRM_ADMIN_PASSWORD` (uma palavra-passe forte e exclusiva) e `CRM_SESSION_SECRET` (um valor aleatório de pelo menos 32 caracteres). Configure o ambiente de produção e, se precisar de testar previews, associe-lhes uma base e segredos separados.
3. Publique o projeto Pages com `dist` como diretório de saída e `functions` na raiz do projeto. Após a publicação, abra `/admin` e confirme que o login funciona.

Use o CRM para dados de contacto e seguimento comercial. Mantenha informação clínica em registos próprios.

## Pendências

- Ativação da zona DNS, associação do domínio final e validação de HTTPS e www.
- Imagem de drenagem linfática permanece provisória: não foi identificada uma fotografia real que confirme a técnica.
- Política de privacidade continua uma minuta, sujeita a dados finais e revisão.
- GA4, GTM e Google Ads não estão instalados; consentimento e eventos devem ser validados ao integrar essas plataformas.

Não guardar credenciais, fichas de atendimento ou contactos de pacientes neste repositório.

