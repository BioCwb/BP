# Noite do Bingo

**Versão Atual: 1.0.16**

Bem-vindo ao **Noite do Bingo**, um jogo de bingo multiplayer em tempo real construído com React, TypeScript e Firebase. Este projeto oferece uma experiência de jogo completa com autenticação de usuários, um lobby interativo, jogabilidade em tempo real e um painel de administração robusto para gerenciamento total da partida.

## ✨ Funcionalidades

### Para Jogadores
- **Autenticação Segura:** Sistema de login e registro com e-mail/senha e login social com Google. Inclui verificação de e-mail.
- **Lobby do Jogo:** Uma área central onde os jogadores podem ver seu saldo, comprar cartelas e entrar na próxima partida.
- **Chat em Tempo Real no Lobby:** Converse com outros jogadores no lobby enquanto espera o início do jogo.
- **Compra de Cartelas:** Os jogadores podem comprar até 10 cartelas por rodada usando fichas virtuais (F).
- **Bônus Diário:** Possibilidade de resgatar 10 Fichas (F) gratuitas uma vez por dia para continuar jogando.
- **Jogabilidade Automatizada:** Sente-se e assista! O sistema marca automaticamente os números sorteados em suas cartelas.
- **Detecção Automática de Vencedor:** O jogo detecta automaticamente o primeiro jogador a completar uma cartela inteira (blackout) e encerra a partida.
- **Ranking Dinâmico:** Um placar na tela do jogo mostra o progresso dos jogadores em tempo real, indicando quantos números faltam para cada um.
- **Status de Conexão do Jogador:** Veja quem está online ou offline através de um indicador de status (verde/vermelho) no ranking.
- **Destaque da Última Bola:** A bola mais recente sorteada recebe um destaque visual especial em suas cartelas, facilitando a identificação.
- **Modo Espectador:** Entre no jogo como espectador para assistir à partida em tempo real, visualizando as cartelas de todos os jogadores, sem participar ativamente.
- **Gerenciamento de Perfil:** Os jogadores podem atualizar seu nome de usuário e alterar sua senha.
- **Recuperação de Erros:** Em caso de uma falha de conexão crítica, um botão "Reiniciar Sessão" permite que você volte facilmente para a tela de login.

### Para Administradores
- **Painel de Administração:** Uma interface exclusiva para o administrador monitorar e controlar o jogo.
- **Monitoramento em Tempo Real:** Visualize o status do jogo, o número de jogadores, a quantidade de bolas sorteadas e o prêmio acumulado.
- **Visualização de Números Sorteados:** Acompanhe os números sorteados em tempo real diretamente na aba de visão geral do painel.
- **Controles Manuais do Jogo:**
  - **Iniciar Jogo Flexível:** Inicie uma nova partida instantaneamente. Se o jogo estiver aguardando jogadores, ele apenas iniciará a contagem, mantendo as cartelas compradas. Se um jogo já estiver em andamento, esta ação irá resetá-lo e começar uma nova rodada imediatamente.
  - **Início Rápido na Tela de Jogo:** Inicie a partida diretamente da tela de jogo através de um botão exclusivo para administradores, visível quando o jogo está aguardando para começar.
  - **Pausar/Retomar:** Pause o jogo, informando um motivo que será exibido para todos os jogadores, e retome quando desejar.
  - **Resetar Jogo:** Reinicie a rodada, limpando o estado atual do jogo e preparando-o para uma nova partida.
  - **Limpar Todas as Cartelas:** Remova *todas* as cartelas de *todos* os jogadores da rodada. Esta ação requer a senha do administrador e uma justificação, reembolsa integralmente todos os jogadores e zera o prêmio da rodada.
- **Moderação de Chat:** Monitore e apague mensagens do chat do lobby diretamente do painel de administração. Cada exclusão é registrada em um log de auditoria para transparência.
- **Gerenciamento de Usuários:**
    - **Visão Completa:** Visualize, busque e gerencie todos os usuários cadastrados, não apenas os online.
    - **Editar Fichas:** Adicione ou remova fichas de qualquer jogador com uma justificação obrigatória.
    - **Resetar Senha:** Envie e-mails de redefinição de senha para os jogadores.
    - **Remover Cartela de Jogador:** Remova uma cartela específica de um jogador com uma justificação obrigatória. O jogador é reembolsado, e a ação fica registrada.
- **Histórico de Compras PIX:** Um log dedicado para visualizar todas as compras de fichas via Pix, incluindo jogador, valor, administrador que confirmou e data.
- **Histórico de Vendas Persistente:** Monitore um log em tempo real de todas as cartelas compradas, que agora é persistido entre as rodadas. Cada compra é associada a um `roundId` (ID da rodada) para facilitar a auditoria e análise de vendas ao longo do tempo.
- **Busca de Histórico e Chat:** Filtre rapidamente o histórico de vendas e as mensagens do chat por nome de jogador ou conteúdo da mensagem.
- **Configurações de Tempo e Pagamento:** Ajuste a duração dos contadores de tempo do jogo e configure os dados para pagamentos via Pix (chave, nome, cidade, WhatsApp).
- **Log de Ações do Administrador:** Um histórico detalhado de todas as ações administrativas (resetar jogo, pausar, remover cartela, etc.) é registrado, mostrando quem fez o quê, quando e com qual justificativa, garantindo total transparência.

---

## 🗺️ Mapa do Jogo (Estrutura da Aplicação)

1.  **Tela de Autenticação:** A porta de entrada do jogo. Os usuários podem escolher entre `Entrar` em uma conta existente ou `Registrar` uma nova.
2.  **Lobby do Jogo:** Após o login, os jogadores chegam aqui. É a área de espera onde podem conversar no chat, se preparar para a próxima rodada, comprar cartelas e gerenciar seu perfil.
3.  **Tela do Jogo:** Onde a ação acontece. Esta tela exibe o painel com os números sorteados, as cartelas do jogador (ou de todos, em modo espectador) e o ranking dos participantes.
4.  **Painel de Administração:** Acessível apenas pelo administrador a partir do lobby, este painel é o centro de controle do jogo.

---

## 룰 Manual e Regras do Jogo

### Objetivo
O objetivo é ser o primeiro jogador a completar uma cartela inteira (todos os 24 números). O sistema detecta o vencedor automaticamente.

### Como Jogar
1.  **Crie uma Conta e Faça Login:** Use seu e-mail ou conta Google para acessar o jogo. Novos jogadores recebem um bônus de 100 Fichas (F).
2.  **Acesse o Lobby:** Após o login, você estará no lobby. Aqui você pode conversar com outros jogadores e ver seu saldo de fichas.
3.  **Compre Suas Cartelas:** Antes de a partida começar, clique no botão "Comprar Cartela (10 F)". Cada cartela custa 10 Fichas. Você pode comprar até 10 cartelas por rodada. As cartelas são válidas para uma única partida; você precisará comprar novas cartelas para cada nova rodada.
4.  **Aguarde o Início:** O jogo não começa automaticamente. O administrador iniciará a partida manually assim que houver no mínimo **2 jogadores com cartelas compradas**.
5.  **Acompanhe e Marque:** Os números sorteados recebem um destaque especial na borda. Para uma experiência mais interativa, você pode clicar nesses números para marcá-los com uma animação, ajudando a visualizar seu progresso!
6.  **Vitória Automática:** O primeiro jogador a ter todos os 24 números de uma cartela sorteados vence o jogo. O sistema detecta a vitória instantaneamente e encerra a partida, então não é preciso se preocupar em clicar em "BINGO!", apenas torça e acompanhe suas cartelas!
7.  **Retorno ao Lobby:** Após a exibição dos vencedores, todos os jogadores retornam automaticamente ao lobby para se prepararem para a próxima rodada.

### Prêmios
- Cada cartela comprida por 10 F adiciona 9 F ao prêmio acumulado da rodada.
- O prêmio total é dividido igualmente entre todos os vencedores da rodada.

---

## 💻 Guia de Instalação para Desenvolvedores

Siga estes passos para configurar e executar o projeto em seu ambiente local.

### Pré-requisitos
- Um editor de código, como o **Visual Studio Code**.
- A extensão **Live Server** para o VS Code (ou qualquer servidor web local).
- Uma conta Google para criar um projeto no Firebase.

### Passo 1: Configurar o Firebase
1.  Acesse o [Console do Firebase](https://console.firebase.google.com/).
2.  Clique em **"Adicionar projeto"** e siga as instruções para criar um novo projeto.
3.  No painel do seu projeto, vá para a seção **Authentication**.
    - Clique em **"Primeiros passos"**.
    - Habilite os provedores de login **"E-mail/senha"** e **"Google"**.
4.  Em seguida, vá para a seção **Firestore Database**.
    - Clique em **"Criar banco de dados"**.
    - Inicie no **modo de produção** e escolha uma localização para o servidor.
    - Vá para a aba **Regras** e atualize-as para permitir leitura e escrita (para desenvolvimento):
      ```
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /{document=**} {
            allow read, write: if true;
          }
        }
      }
      ```
      **Aviso:** Estas regras são inseguras para produção. Use regras de segurança adequadas para um aplicativo real.
5.  Volte para a página principal do seu projeto, clique no ícone de engrenagem e vá para **"Configurações do Projeto"**.
    - Na aba "Geral", desça até a seção "Seus apps".
    - Clique no ícone da web (`</>`) para registrar um novo aplicativo da web.
    - Dê um nome ao seu app e clique em "Registrar app".
    - O Firebase fornecerá um objeto de configuração `firebaseConfig`. **Copie este objeto.**

### Passo 2: Configurar o Projeto Localmente
1.  Clone ou baixe os arquivos do projeto para o seu computador.
2.  Abra a pasta do projeto no VS Code.
3.  Navegue até o arquivo `firebase/config.tsx`.
4.  **Substitua** o objeto `firebaseConfig` existente pelo que você copiou do seu projeto Firebase.

### Passo 3: Definir o Administrador do Jogo
1.  Execute o aplicativo (veja o Passo 4) e crie uma conta de usuário para você (pode ser com e-mail/senha ou Google).
2.  Volte ao **Console do Firebase**, vá para a seção **Authentication**.
3.  Na lista de usuários, encontre a conta que você acabou de criar e **copie o UID do usuário**.
4.  Abra o arquivo `components/GameLobby.tsx`.
5.  Encontre a constante `ADMIN_UID` e **substitua o valor existente pelo seu UID**.
    ```javascript
    // Exemplo:
    const ADMIN_UID = 'SEU_UID_DE_ADMINISTRADOR_AQUI';
    ```

### Passo 4: Executar a Aplicação
Este projeto não usa um empacotador como Vite ou Create React App, então não há um comando `npm start`. A maneira mais fácil de executá-lo é com um servidor local.

1.  Certifique-se de ter a extensão **Live Server** instalada no VS Code.
2.  Clique com o botão direito no arquivo `index.html` na barra de explorador de arquivos.
3.  Selecione **"Open with Live Server"**.
4.  Seu navegador padrão abrirá com o jogo em execução. Agora você pode fazer login, e se o seu UID estiver configurado corretamente, o botão "Painel do Admin" aparecerá no lobby.