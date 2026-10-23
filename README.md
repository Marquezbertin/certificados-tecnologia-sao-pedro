# Certificados Tecnologia na Prática

Emissor em lote e validador público dos certificados do curso.

## Privacidade por padrão

Os nomes dos alunos são processados no navegador de emissão e não são enviados ao banco. O banco guarda somente o hash do código, o curso, a carga horária, a data e a situação. O código bruto fica no certificado e no CSV baixado pelo operador. A consulta pública não permite pesquisar nomes nem lista alunos.

Como o curso inclui menores, a organização responsável deve definir finalidade, base legal, transparência, retenção e responsáveis pelo tratamento antes de operar o sistema. A minimização técnica não substitui essa governança; consulte o aviso da ANPD sobre o melhor interesse de crianças e adolescentes.

## Configurar Supabase

1. Crie um projeto Supabase e execute `supabase/migrations/202610230001_certificates.sql` no SQL Editor.
2. Crie contas de autenticação para os operadores e desative o cadastro público.
3. Insira na tabela `issuance_admins` o UUID de cada operador:
   ```sql
   insert into public.issuance_admins (user_id) values ('UUID-DO-OPERADOR');
   ```
4. Em Edge Function Secrets, configure `CERTIFICATES_PUBLISHABLE_KEY` e `CERTIFICATES_DB_KEY`. A segunda é a chave secreta/service role; nunca a coloque no site ou no GitHub.
5. Instale o Supabase CLI, vincule o projeto e publique as funções:
   ```powershell
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase functions deploy verify-certificate
   supabase functions deploy admin-certificates
   supabase secrets set CERTIFICATES_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA CERTIFICATES_DB_KEY=SUA_CHAVE_SECRETA
   ```
6. Edite `site/config.js` com a URL do projeto e a chave publishable/anon, que é pública e limitada pelas funções.

## GitHub Pages

O workflow publica `site/` a cada envio para `main`. Em **Settings → Pages**, selecione **GitHub Actions**. URL esperada: `https://marquezbertin.github.io/certificados-tecnologia-sao-pedro/`.

## Uso

Abra `admin.html`, entre com uma conta autorizada, informe curso, carga horária, data e um nome por linha. O navegador cria códigos aleatórios de 128 bits e envia somente os hashes. Baixe o CSV privado ou imprima/salve os certificados como PDF antes de encerrar a sessão. O aluno/responsável consulta o código na página inicial. A equipe pode revogar um registro pelo painel.

O CSV contém nomes e códigos verificadores: mantenha-o em local restrito. O sistema não envia e-mail nem guarda nomes para reimpressão. Cópias baixadas continuam existindo depois de uma revogação.

## Referências

- [GitHub Pages](https://docs.github.com/en/pages)
- [Segredos das Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Segurança de dados Supabase](https://supabase.com/docs/guides/database/secure-data)
- [ANPD e dados de crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes)
