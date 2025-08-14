# resposta-generativa-WhatsApp

> **Uma orquestra de inteligência conversacional no WhatsApp, onde o fluxo de mensagens se transforma em sinfonia de respostas precisas.**

---

## 🚀 Visão Geral

Este projeto é um fluxo de interação generativa para WhatsApp, que interpreta mensagens do usuário, extrai o contexto, confirma a existência de itens em uma API e entrega respostas altamente contextualizadas. Tudo isso com uma memória fluida que se apaga após 24 horas — porque nem todo fantasma gosta de morar para sempre.

---

## 🔄 Fluxo de Mensagens

1. **Recebimento da mensagem do usuário**  
   A mensagem chega crua, cheia de vida e de palavras soltas.

2. **Tokenização e análise de contexto**  
   Quebramos a mensagem em tokens para identificar  intenções e elementos importantes. A partir daí, montamos um contexto para guiar a conversa.

3. **Consulta na API via SDK da IA**  
   Perguntamos se o que o usuário procura está na nossa base de dados. A IA retorna um valor booleano:
   - **True:** Confirmamos se o usuário quer mais detalhes sobre o produto identificado.
   - **False:** Perguntamos se o usuário quer sugestões alternativas ou deseja reformular a busca.

4. **Busca refinada na API**  
   Com os termos confirmados, buscamos na API os dados mais relevantes.

5. **Resposta formatada e envio ao usuário**  
   O resultado vem no formato JSON, que é convertido numa mensagem clara, amigável e pronta para o WhatsApp.

6. **Contexto armazenado temporariamente**  
   Salvamos o contexto da conversa por até 24 horas, garantindo continuidade e fluidez. Após esse período, o contexto é apagado do banco, mantendo a leveza da memória.

---

## 🛠️ Tecnologias e Ferramentas

- **WhatsApp API .  
- **Inteligência Artificial** para compreensão e geração de respostas.  
- **Banco de Dados Temporário** para armazenar contexto e garantir conversas dinâmicas.  
- **JSON** para transporte e manipulação de dados.
-**Node.JS & algumas bibliotecas
---

