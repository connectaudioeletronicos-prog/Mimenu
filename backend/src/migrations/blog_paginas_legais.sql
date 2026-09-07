-- Termos de Servico e Politica de Privacidade passam a usar o mesmo
-- sistema de "paginas fixas" do Sobre nos / Contato, editavel pelo
-- super admin. O conteudo atual (que estava fixo no HTML) e migrado
-- pra ca como ponto de partida, no mesmo "markdown" leve dos posts
-- (## subtitulo, - item de lista, **negrito**, ![](url) pra imagem).
INSERT INTO blog_paginas (id) VALUES ('termos-servico') ON CONFLICT (id) DO NOTHING;
INSERT INTO blog_paginas (id) VALUES ('politica-privacidade') ON CONFLICT (id) DO NOTHING;

UPDATE blog_paginas SET
  titulo = 'Termos de Serviço',
  conteudo = $md$Este documento é um modelo inicial, escrito para você editar. Revise os pontos em **[colchetes]** e, se possível, peça a um advogado para conferir antes de publicar em definitivo.

## 1. Sobre o Palatos

O Palatos é uma plataforma que permite que restaurantes e estabelecimentos ("lojistas") criem, personalizem e publiquem cardápios digitais e vitrines online, acessíveis por seus clientes através de um link ou QR code.

Estes Termos de Serviço regem o uso da plataforma por lojistas cadastrados. Ao criar uma conta no Palatos, você concorda com estes termos.

## 2. Cadastro e conta

- Para usar o Palatos como lojista, é necessário completar o cadastro, incluindo dados legais da empresa e, quando solicitado, documentos de verificação.
- Você é responsável por manter a veracidade das informações fornecidas e pela segurança de sua conta.
- O login pode ser feito por e-mail e senha ou por login social (Google), conforme disponibilizado na plataforma.

## 3. Uso da plataforma

- O lojista é responsável pelo conteúdo publicado em seu cardápio (descrições, preços, imagens).
- É proibido usar a plataforma para publicar conteúdo ilegal, enganoso, ou que viole direitos de terceiros.
- O Palatos pode remover conteúdo ou suspender contas que violem estes termos.

## 4. Disponibilidade do serviço

Fazemos o possível para manter o Palatos disponível e funcionando corretamente, mas não garantimos operação ininterrupta. Manutenções, atualizações e melhorias podem ocorrer a qualquer momento, inclusive com o serviço em produção.

## 5. Planos e pagamento

**[Descreva aqui se há plano gratuito, mensalidades, taxas por uso, ou outro modelo de cobrança do Palatos.]**

## 6. Propriedade intelectual

A marca Palatos, seu design e sua tecnologia pertencem à ConectTec. O conteúdo enviado pelo lojista (fotos, textos, cardápio) continua sendo de propriedade do lojista, que concede ao Palatos permissão para exibi-lo dentro da plataforma.

## 7. Cancelamento

O lojista pode encerrar sua conta a qualquer momento entrando em contato pelo e-mail de suporte. O Palatos também pode encerrar contas que violem estes termos, mediante aviso prévio quando possível.

## 8. Limitação de responsabilidade

O Palatos é fornecido "como está". Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária do serviço, erros de conteúdo inserido pelo próprio lojista, ou uso indevido da plataforma por terceiros.

## 9. Alterações nestes termos

Podemos atualizar estes termos periodicamente. A data da última atualização estará sempre indicada no topo desta página. O uso continuado da plataforma após alterações implica concordância com os novos termos.

## 10. Contato

Dúvidas sobre estes termos podem ser enviadas para palatosoficial@gmail.com.$md$
WHERE id = 'termos-servico' AND conteudo IS NULL;

UPDATE blog_paginas SET
  titulo = 'Política de Privacidade',
  conteudo = $md$Este documento é um modelo inicial, escrito para você editar. Revise os pontos em **[colchetes]** e, se possível, peça a um advogado para conferir antes de publicar em definitivo — principalmente as seções sobre dados sensíveis (documentos enviados no cadastro) e a LGPD.

## 1. Quem somos

O Palatos é uma plataforma que permite que restaurantes e outros estabelecimentos ("lojistas") criem e gerenciem cardápios digitais e vitrines online. Esta política explica como coletamos, usamos e protegemos os dados de quem usa o Palatos — tanto lojistas quanto seus clientes finais.

Responsável pelo tratamento de dados: **[Razão social da ConectTec / CNPJ]**, contato: contatoconnectaudioeletronicos@gmail.com.

## 2. Quais dados coletamos

Dependendo de como você usa o Palatos, podemos coletar:

- **Dados de cadastro do lojista:** nome, e-mail, telefone, dados da empresa, endereço e documentos de identificação enviados durante o processo de registro.
- **Dados de login:** quando você entra com sua conta Google, recebemos seu nome, e-mail e foto de perfil públicos, conforme autorizado por você na tela de permissão do Google.
- **Dados de uso:** como o cardápio é visualizado, cliques, e outras interações dentro da plataforma, usados para melhorar o produto.
- **Dados técnicos:** endereço IP, tipo de dispositivo e navegador, coletados automaticamente para segurança e funcionamento do site.

## 3. Como usamos os dados

- Para criar e manter a conta do lojista e o cardápio digital associado.
- Para verificar a identidade do lojista durante o cadastro (documentos enviados).
- Para autenticação via login social (Google).
- Para comunicação sobre atualizações, suporte e avisos importantes da plataforma.
- Para melhorar a segurança, o desempenho e as funcionalidades do Palatos.

## 4. Login com Google

Ao optar por entrar com sua conta Google, o Palatos recebe apenas as informações básicas de perfil autorizadas por você (nome, e-mail e foto). Não temos acesso à sua senha do Google, nem a outros dados da sua conta Google além do que é explicitamente exibido na tela de consentimento no momento do login.

## 5. Armazenamento e segurança

Os dados são armazenados em infraestrutura de banco de dados na nuvem (Supabase), com controles de acesso restritos. Documentos enviados durante o cadastro ficam em um repositório de armazenamento privado, acessível apenas pela equipe responsável pela verificação de lojistas.

## 6. Compartilhamento de dados

Não vendemos dados pessoais. Compartilhamos informações apenas com prestadores de serviço essenciais ao funcionamento da plataforma (como provedores de hospedagem e banco de dados), ou quando exigido por lei.

## 7. Seus direitos

De acordo com a Lei Geral de Proteção de Dados (LGPD), você pode solicitar a qualquer momento:

- Confirmação da existência de tratamento de dados
- Acesso, correção ou exclusão dos seus dados
- Portabilidade dos dados a outro fornecedor
- Revogação do consentimento dado

Para exercer esses direitos, entre em contato pelo e-mail palatosoficial@gmail.com.

## 8. Alterações nesta política

Podemos atualizar esta política periodicamente. A data da última atualização estará sempre indicada no topo desta página.$md$
WHERE id = 'politica-privacidade' AND conteudo IS NULL;
