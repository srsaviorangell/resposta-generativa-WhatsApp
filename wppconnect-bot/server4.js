// Carrega as variáveis de ambiente do arquivo .env para manter chaves seguras.
require('dotenv').config(); 
const express = require('express'); 
const axios = require('axios'); 
const { create } = require('@wppconnect-team/wppconnect'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const fs = require('fs');


// Tenta obter o token da API Tiny do ambiente.
const TINY_API_TOKEN = process.env.TINY_API_TOKEN?.trim();

// Inicializa o servidor Express
const app = express();
const port = process.env.PORT || 3000;

// Objeto para armazenar o contexto da conversa de cada usuário
const userContexts = {};
function getUserContext(from) {
    if (!userContexts[from]) {
        userContexts[from] = {
            // Adiciona a propriedade 'state' para gerenciar o fluxo da conversa
            state: 'INITIAL', 
            pendingAction: null,
            produtos: []
        };
    }
    return userContexts[from];
}

// Middleware para processar JSON e registrar requisições HTTP.
app.use(express.json());
app.use((req, res, next) => {
    console.info(`[${new Date().toLocaleString('pt-BR')}] ${req.method} ${req.path}`);
    next();
});

// Configuração do cliente Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Constante para limitar o número de produtos listados em uma única resposta.
const MAX_PRODUTOS_PARA_LISTAR = 1;

/**
 * Chama a API do Google Gemini via SDK para obter uma resposta.
 * Esta função tenta extrair um bloco JSON da resposta, se houver.
 * @param {string} prompt - O texto a ser enviado para a IA.
 * @returns {Promise<string>} - A resposta de texto da IA.
 */
async function chamarGeminiSDK(prompt) {
    console.debug('[DEBUG] Enviando para Gemini:', prompt.substring(0, Math.min(prompt.length, 100)) + '...');

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Tenta encontrar e extrair um bloco JSON da resposta
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const match = text.match(jsonBlockRegex);
        if (match && match[1]) {
            text = match[1].trim(); 
        } else {
            // Se não encontrar, remove blocos de código genéricos
            text = text.replace(/```/g, '').trim();
        }

        console.debug('[DEBUG] Resposta do Gemini:', text?.substring(0, Math.min(text.length, 100)) + '...');
        return text || 'Desculpe, não consegui gerar uma resposta. Pode reformular?';
    } catch (error) {
        console.error('[ERRO] Gemini AI:', { message: error.message });
        throw error;
    }
}

/**
 * Busca produtos na API do Tiny ERP.
 * @param {string} termoBusca - Termo de pesquisa (nome ou ID do produto).
 * @returns {Promise<object>} Um objeto com o status da busca e a lista de produtos.
 */
async function buscarProdutoTiny(termoBusca) {
    if (!TINY_API_TOKEN) {
        console.error("[ERRO] O TINY_API_TOKEN não está configurado. Verifique seu arquivo .env.");
        return { sucesso: false, erro: "O token da API Tiny não está configurado." };
    }

    try {
        const urlAPI = `https://api.tiny.com.br/api2/produtos.pesquisa.php`;
        const response = await axios.get(urlAPI, {
            params: {
                token: TINY_API_TOKEN,
                pesquisa: termoBusca,
                formato: 'json'
            }
        });

        const produtos = response.data.retorno.produtos;

        if (!produtos || produtos.length === 0) {
            console.log('[INFO] Nenhum produto encontrado para:', termoBusca);
            return { sucesso: false, erro: `Não encontrei nenhum produto para "${termoBusca}".` };
        }

        const listaProdutos = produtos.map(item => {
            const dados = item.produto;
            return {
                nome: dados.nome,
                id: dados.id,
                preco: dados.preco,
                estoque: dados.estoque
            };
        });

        return { sucesso: true, produtos: listaProdutos };

    } catch (error) {
        console.error('[ERRO] Falha ao chamar a API do Tiny:', error.message);
        return { sucesso: false, erro: "Ocorreu um erro ao buscar produtos. Tente novamente mais tarde." };
    }
}

/**
 * Filtra uma lista de produtos por tokens de busca.
 * Esta função quebra o termo de busca em palavras e verifica se todas estão no nome do produto.
 * @param {Array} produtos - Lista de produtos a serem filtrados.
 * @param {string} termoBusca - Novo termo de busca.
 * @param {boolean} strict - Se true, exige que todos os tokens estejam no nome. Se false, exige pelo menos um.
 * @returns {Array} - Lista de produtos filtrada.
 */
function tokenizarTexto(texto) {
  return texto.toLowerCase()
    .split(/\s+/) // separa por espaço
    .map(token => {
      // Se tiver números + letras juntos (ex: 50mm), separa eles
      const match = token.match(/^(\d+)([a-z]+)$/);
      return match ? [match[1], match[2]] : [token];
    })
    .flat();
}

function salvarJSON(nomeArquivo, dados) {
  try {
    fs.writeFileSync(nomeArquivo, JSON.stringify(dados, null, 2), 'utf8');
    console.log(`✅ Dados salvos em ${nomeArquivo}`);
  } catch (error) {
    console.error('❌ Erro ao salvar arquivo JSON:', error);
  }
}
/**
 * Filtra uma lista de produtos por tokens de busca, priorizando a melhor correspondência.
 * @param {Array} produtos - Lista de produtos a serem filtrados.
 * @param {string} termoBusca - Novo termo de busca para refinamento.
 * @returns {Array} - Lista de produtos filtrada e ordenada por relevância.
 */
function filtrarProdutosPorRelevancia(produtos, termoBusca) {
    if (!termoBusca || produtos.length === 0) {
        return produtos;
    }

    const tokensBusca = tokenizarTexto(termoBusca);
    if (tokensBusca.length === 0) {
        return produtos;
    }

    // Calculamos a "pontuação" de cada produto com base nos tokens encontrados.
    const produtosComPontuacao = produtos.map(produto => {
        let pontuacao = 0;
        // Pega os tokens do nome do produto (você já faz isso em processarBusca)
        const tokensProduto = tokenizarTexto(produto.nome);

        // Verifica quantos tokens do refinamento estão presentes no nome do produto.
        tokensBusca.forEach(tokenRefinamento => {
            if (tokensProduto.includes(tokenRefinamento)) {
                pontuacao++;
            }
        });

        // Retornamos o produto junto com sua pontuação.
        return {
            ...produto,
            pontuacao: pontuacao
        };
    });

    // Filtramos apenas os produtos que tiveram pelo menos um token de refinamento.
    const produtosFiltrados = produtosComPontuacao.filter(p => p.pontuacao > 0);

    // Ordenamos a lista para que os produtos com mais tokens correspondentes apareçam primeiro.
    produtosFiltrados.sort((a, b) => b.pontuacao - a.pontuacao);
    
    return produtosFiltrados;
}


/**
 * Processa a mensagem recebida e decide a resposta (comandos internos ou IA).
 * @param {string} mensagemRecebida - Texto recebido do usuário.
 * @param {object} context - O objeto de contexto do usuário para armazenamento de estado.
 * @returns {Promise<string>} - A resposta a ser enviada ao usuário.
 */
async function processarMensagem(mensagemRecebida, context) {
    console.debug('[DEBUG] Processando mensagem:', mensagemRecebida);

    const msg = mensagemRecebida.toLowerCase().trim();
    
    // 1. Lógica para SAIR do modo de busca (primeira coisa a ser checada)
    const comandosDeSaida = ['cancelar', 'nao', 'não', 'nova busca', 'sair'];
    if (comandosDeSaida.includes(msg)) {
        context.state = 'INITIAL';
        context.produtos = []; // Limpa os produtos para a próxima busca
        context.pendingAction = null;
        return "Ok, finalizei a busca. Diga o que gostaria de pesquisar agora.";
    }
    // O comando 'voltar' continua aqui
    // O comando 'mostrar tudo' para quando a busca inicial retorna poucos produtos foi removido daqui
    

    // 2. Lógica para REFINAR a busca (tratada antes de chamar a IA)
    if (context.state === 'SEARCH_MODE' && context.produtos && context.produtos.length > 0) {
        
        // **NOVO:** Lógica para mostrar a lista completa
        const comandosVerTodos = ['todos', 'todas','mostrar tudo', 'lista completa', 'ver todos', 'sim','sim porfavor','claro','yes','ok'];
        const isVerTodos = comandosVerTodos.includes(msg);

        // **NOVO:** Lógica para mostrar um número específico de itens
        const matchNum = msg.match(/quero ver os (\d+) primeiros|quero ver (\d+)|(\d+) primeiros/);
        const numeroParaMostrar = matchNum ? parseInt(matchNum[1] || matchNum[2] || matchNum[3]) : null;

        if (isVerTodos || numeroParaMostrar) {
            const limite = isVerTodos ? context.produtos.length : Math.min(numeroParaMostrar, context.produtos.length);
            let respostaProdutos = `✅ Agora! Mostrando os primeiros ${limite} de ${context.produtos.length} do seu pedido:\n\n`;
            
            context.produtos.slice(0, limite).forEach(produto => {
                respostaProdutos += `* ${produto.nome} (ID: ${produto.id})\n`;
                respostaProdutos += `  Preço: R$ ${produto.preco}\n`;
                respostaProdutos += `  Estoque: ${produto.estoque}\n\n`;
            });
            respostaProdutos += "\n\nQuer me dar mais um detalhe ou prefere cancelar?";
            return respostaProdutos;
        }

        // Lógica de refinamento existente
        console.info(`[INFO] Mensagem recebida em modo de busca. Refinando por "${msg}".`);

        const produtosRefinados = filtrarProdutosPorRelevancia(context.produtos, msg);

        if (produtosRefinados.length > 0) {
            // Salva a lista atual no contexto para futuras interações.
            context.produtos = produtosRefinados;
            let respostaProdutos = `Olha só o que achei pro termo ${msg} e encontrei :\n\n`;
            
            // Exibe no máximo o limite definido (MAX_PRODUTOS_PARA_LISTAR)
            produtosRefinados.slice(0, MAX_PRODUTOS_PARA_LISTAR).forEach(produto => {
                respostaProdutos += `* ${produto.nome} (ID: ${produto.id})\n`;
                respostaProdutos += `  Preço: R$ ${produto.preco}\n`;
                respostaProdutos += `  Estoque: ${produto.estoque}\n\n`;
            });

            if (produtosRefinados.length > MAX_PRODUTOS_PARA_LISTAR) {
                respostaProdutos += `...E tem mais ${produtosRefinados.length - MAX_PRODUTOS_PARA_LISTAR} resultados.`;
            }

            respostaProdutos += "\n\nQuer me dar mais um detalhe ou prefere cancelar?";
            return respostaProdutos;
        } else {
            return `Não encontrei nenhum produto que corresponda a "${msg}" na sua busca anterior. Tente outro termo ou digite 'cancelar'.`;
        }
    }

    // 3. Lógica para o estado de confirmação (sem alterações)
    if (context.state === 'AWAITING_CONFIRMATION') {
        if (msg === 'sim' || msg === '1') {
            const termoBusca = context.pendingAction.termo;
            context.pendingAction = null;
            context.state = 'SEARCH_MODE';
            return await processarBusca(termoBusca, context);
        } else {
            context.state = 'INITIAL';
            context.pendingAction = null;
            return "Ok, busca cancelada. Posso ajudar com mais alguma coisa?";
        }
    }

    // 4. Lógica para o estado INICIAL (recorrendo à IA)
    const promptParaGemini = `
        SUA ÚNICA RESPOSTA DEVE SER UM OBJETO JSON VÁLIDO.
        NÃO INCLUA NENHUM TEXTO, SAUDAÇÃO OU FORMATAÇÃO ADICIONAL.
        Sempre retorne apenas um JSON.

        Analise a "Frase do usuário" e defina a intenção.
        Considere o contexto da conversa.
        
        --- Intenção: Buscar Produto (API Tiny) ---
        Se a frase pedir para buscar um produto pela primeira vez e for um termo amplo, retorne:
        {
            "acao": "confirma_busca",
            "termo": "[termo que a IA identificou]"
        }
        Se for uma busca por um termo específico, retorne:
        {
            "acao": "buscar_produto",
            "termo": "[termo específico que será usado na busca]"
        }
        
        --- Intenção: Nova Busca ---
        Se a frase iniciar uma nova busca que não tem relação com o tópico anterior, retornar:
        {
            "acao": "nova_busca",
            "termo": "[o novo termo de busca]"
        }

        --- Intenção padrão: Conversa genérica (não é produto) ---
        Se não reconhecer nenhuma intenção clara, retorne:
        {
            "acao": "desconhecida"
        }

        ---
        Frase do usuário: "${msg}"
        ---
        JSON de saída:
    `;

    let respostaIA;
    try {
        respostaIA = await chamarGeminiSDK(promptParaGemini);
    } catch (error) {
        console.error('[ERRO] Falha ao chamar Gemini para processar intenção:', error);
        return "Desculpe, não consegui entender sua intenção no momento. Poderia repetir?";
    }

    try {
        const dados = JSON.parse(respostaIA);
        const termoBusca = dados.termo;
        
        switch(dados.acao) {
            case "confirma_busca":
                context.state = 'AWAITING_CONFIRMATION';
                context.pendingAction = dados;
                return `Claro que sim! 😄Está querendo saber quantas ${termoBusca} temos por aqui, não é?`;
            
            case "buscar_produto":
            case "nova_busca": 
                context.produtos = [];
                context.state = 'SEARCH_MODE';
                return processarBusca(termoBusca, context);
                
            case "desconhecida":
                return "Acho que meu cérebro de bot deu um nó agora 😂\n\n Repete pra mim o que você precisa que eu vou atrás rapidinho!";
            
            default:
                return "Desculpe, não consegui processar essa solicitação. Poderia perguntar sobre um produto?";
        }
    } catch (err) {
        console.error('[ERRO] A IA não retornou um JSON válido ou houve um erro de processamento:', { rawResponse: respostaIA, error: err.message });
        return "Tive dificuldade para entender sua pergunta. Pode repetir com outras palavras?";
    }
}

// ===========================================================================
// FUNÇÃO processarBusca
// ===========================================================================


/**
 * Função auxiliar para processar a busca e formatar a resposta.
 * @param {string} termoBusca - O termo de busca.
 * @param {object} context - O objeto de contexto do usuário.
 * @returns {Promise<string>} - A resposta formatada para o usuário.
 */

async function processarBusca(termoBusca, context) {
    const resultadoBusca = await buscarProdutoTiny(termoBusca);
    
    if (resultadoBusca.sucesso) {
        // Salva a lista de produtos no contexto do usuário para futuras interações.
        context.produtos = resultadoBusca.produtos;

        if (resultadoBusca.produtos.length > MAX_PRODUTOS_PARA_LISTAR) {
            return `Achei vários modelos de  ${termoBusca}.\nVocê quer que eu te mostre tudo ou prefere me dizer qual tipo tá buscando?.`
        }

        let respostaProdutos = `🔎 Encontrei os seguintes produtos para "${termoBusca}":\n\n`;
        resultadoBusca.produtos.forEach(produto => {
            respostaProdutos += `* ${produto.nome} (ID: ${produto.id})\n`;
            respostaProdutos += `  Preço: R$ ${produto.preco}\n`;
            respostaProdutos += `  Estoque: ${produto.estoque}\n\n`;
        });
        respostaProdutos += "Posso ajudar com mais alguma busca?";
        return respostaProdutos;
    } else {
        context.produtos = [];
        return resultadoBusca.erro;
    }
}
/**
 * Verifica a conexão com a API do Google Gemini.
 * @returns {Promise<boolean>} - True se a conexão for bem-sucedida, false caso contrário.
 */
async function verificarConexaoGemini() {
    console.info('🔍 Verificando conexão com Google Gemini...');
    try {
        const testModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await testModel.generateContent("Olá, Gemini. Responda apenas 'OK'");
        const response = await result.response;
        const text = response.text();
        const status = text.trim().toUpperCase() === 'OK';
        console.info(status ? '✅ Conexão Google Gemini OK!' : '⚠️ Resposta inesperada do Gemini.');
        return status;
    } catch (error) {
        console.error('❌ Falha na conexão com Google Gemini:', error.message);
        return false;
    }
}

// Declara a variável server fora do escopo do app.listen
let server;

// Inicia o servidor Express e o cliente WPPConnect
server = app.listen(port, async () => {
    console.info(`🚀 Servidor rodando na porta ${port}`);
    console.info(`Modo: ${process.env.NODE_ENV || 'desenvolvimento'}`);
    console.info(`Modelo IA: gemini-2.0-flash`);

    // 1. Verifica a conexão com o Google Gemini antes de iniciar o WhatsApp
    const geminiStatus = await verificarConexaoGemini();
    if (!geminiStatus) {
        console.error('❌ Não foi possível estabelecer conexão com o Google Gemini. O bot de IA não funcionará.');
    }

    // 2. Inicia a sessão do WPPConnect
    create({
        session: 'whatsapp-bot',
        headless: true,
        puppeteerOptions: { args: ['--no-sandbox'] },
        disableWelcome: true,
        logQR: true,
        deleteSession: false,
        catchQR: (base64Qr, asciiQR) => {
            console.info('=== ESCANEIE O QR CODE PARA CONECTAR ===');
            console.info(asciiQR); 
        },
        statusFind: (statusSession) => {
            console.info('Status da sessão WhatsApp:', statusSession);
        },
        onLoading: (percent, message) => {
            console.info(`Carregando WhatsApp: ${percent}% - ${message}`);
        },
    })
    .then((client) => {
        console.info('✅ WhatsApp conectado com sucesso!');
        
        // Função para verificar se a mensagem é recente (evita processar mensagens antigas ao iniciar)
        function mensagemAtual(message, limiteMinutos = 5) {
            const momento = Date.now();
            const limite = limiteMinutos * 60 * 1000;
            return (momento - (message.timestamp * 1000)) < limite;
        }

        // Handler de mensagens recebidas
        client.onMessage(async (message) => {
            if (!mensagemAtual(message)) {
                console.debug(`[INFO] Mensagem antiga ignorada de ${message.from}`);
                return;
            }
            // Ignora mensagens de grupo, status, newsletters ou mensagens vazias
            const isNewsletter = message.from.endsWith('@newsletter');
            if (message.isGroupMsg || message.isStatus || isNewsletter || !message.body || message.body.trim() === '') {
                console.debug(`Mensagem ignorada: De ${message.from} (Tipo: ${message.isGroupMsg ? 'Grupo' : message.isStatus ? 'Status' : isNewsletter ? 'Newsletter' : 'Vazia/Sem Corpo'}) | Conteúdo: ${message.body?.substring(0, 50) || 'N/A'}`);
                return;
            }

            console.info(`[MENSAGEM RECEBIDA] De: ${message.from} (${message.sender?.name || 'sem nome'}) | Conteúdo: ${message.body}`);
            const context = getUserContext(message.from);

            try {
                const resposta = await processarMensagem(message.body, context);
                await client.sendText(message.from, resposta);
                console.info(`[INFO] Resposta enviada para ${message.from}`);
            } catch (error) {
                console.error('[ERRO] Falha ao processar ou enviar resposta:', error);
                await client.sendText(message.from, 'Ops, tive um probleminha para te responder. Tente novamente mais tarde!');
            }
        });
    })
    .catch((err) => {
        console.error('❌ Erro crítico ao iniciar WPPConnect:', err);
        process.exit(1);
    });
});

// Tratamento de encerramento gracioso do servidor Node.js
process.on('SIGINT', () => {
    console.info('\n🔴 Recebido SIGINT. Encerrando servidor...');
    if (server) {
        server.close(() => {
            console.info('Servidor encerrado.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
