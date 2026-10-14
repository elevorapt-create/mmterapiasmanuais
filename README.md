# Marília Mendes — Terapias Manuais

Site estático mantido no Codex, versionado no GitHub e publicado pela Cloudflare Pages.

- Repositório: https://github.com/elevorapt-create/mmterapiasmanuais
- Alojamento: https://mmterapiasmanuais.pages.dev/
- Domínio final: https://mariliamendesterapiasmanuais.pt/
- Saída de publicação: `dist`, ramo `main`, sem compilação no alojamento.

## Conteúdo

As seis fotografias reais foram selecionadas e aprovadas pelo gestor. O gestor confirmou a autorização de utilização da imagem da profissional e da pessoa em atendimento, incluindo a disponibilização no repositório público. As variantes WebP responsivas preservam os enquadramentos das fotografias de origem. Não incluir novos originais de alta resolução no repositório.

`build_content.py` gera as páginas HTML e os ficheiros SEO. Executar a partir da raiz do projeto com Python em UTF-8 (`python -X utf8 build_content.py`). CSS, JavaScript e recursos ficam em `dist`. Não substituir variantes `real-*` pelas imagens provisórias anteriores.

## Pendências

- Ativação da zona DNS, associação do domínio final e validação de HTTPS e www.
- Imagem de drenagem linfática permanece provisória: não foi identificada uma fotografia real que confirme a técnica.
- Política de privacidade continua uma minuta, sujeita a dados finais e revisão.
- GA4, GTM e Google Ads não estão instalados; consentimento e eventos devem ser validados ao integrar essas plataformas.

Não guardar credenciais, fichas de atendimento ou contactos de pacientes neste repositório.

