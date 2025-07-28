require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const express = require('express'); // Framework para criar o servidor web
const axios = require('axios'); // Para requisições HTTP (usado para enviar mensagens)
const { create } = require('@wppconnect-team/wppconnect'); // Biblioteca para integração com WhatsApp
const { GoogleGenerativeAI } = require('@google/generative-ai'); // ADICIONADO: SDK do Google Gemini
const TINY_API_TOKEN = process.env.TINY_API_TOKEN?.trim();
// Inicializa o servidor Express
const app = express();
const port = process.env.PORT || 3000; // Usa a porta do .env ou 3000

const userContexts = {}; // Objeto para armazenar o contexto de cada usuário
function getUserContext(from) {
    if (!userContexts[from]) {
        userContexts[from] = {
            lastPokemon: null // Armazena o último Pokémon discutido com este usuário
        };
    }
    return userContexts[from];
}

// Middleware para parsear JSON e logs de requisições HTTP
app.use(express.json());
app.use((req, res, next) => {
    console.info(`[${new Date().toLocaleString('pt-BR')}] ${req.method} ${req.path}`);
    next();
});



// ADICIONADO: Configuração do cliente Google Gemini
// A chave da API é lida do .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Corrigido o nome do modelo para 'gemini-2.0-flash'
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Usando o modelo gemini-2.0-flash



/**
 * Chama a API do Google Gemini via SDK
 * @param {string} prompt - Texto para enviar à IA
 * @returns {Promise<string>} Resposta da IA
 */
async function chamarGeminiSDK(prompt) {
    console.debug('[DEBUG] Enviando para Gemini:', prompt.substring(0, Math.min(prompt.length, 100)) + '...');

    try {
        // O Gemini SDK usa generateContent diretamente com o prompt de texto
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let text = response.text(); // Extrai o texto da resposta
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const match = text.match(jsonBlockRegex);
        if (match && match[1]) {
            text = match[1].trim(); // Pega apenas o conteúdo dentro do bloco ```json
        } else {
            // Se não encontrar o bloco ```json```, tenta remover apenas ``` se houver
            text = text.replace(/```/g, '').trim();
        }

        console.debug('[DEBUG] Resposta do Gemini:', text?.substring(0, Math.min(text.length, 100)) + '...');
        return text || 'Desculpe, não consegui gerar uma resposta. Pode reformular?';
    } catch (error) {
        console.error('[ERRO] Gemini AI:', {
            message: error.message,
            // Detalhes de erro do Gemini podem ser diferentes da OpenRouter.
            // Para depuração, você pode logar o objeto de erro completo:
            // errorObject: error
        });
        // Propaga o erro para ser tratado pela função chamadora
        throw error;
    }
}

/**
 * Envia uma mensagem de texto via WPPConnect (usando o servidor local)
 * @param {string} para - Número do destinatário (ex: 5511999999999@c.us)
 * @param {string} texto - Conteúdo da mensagem
 * @returns {Promise<any>} Resposta da API de envio
 */
async function enviarMensagem(para, texto) {
    try {
        // Delay para evitar flood no WhatsApp e dar tempo para processar
        await new Promise(resolve => setTimeout(resolve, 1000));

        // URL do servidor local que envia mensagens (ajuste se for diferente)
        const url = 'http://localhost:21465/api/send-message';
        const response = await axios.post(url, {
            phone: para,
            message: texto,
            waitForAck: true, // Opcional: espera confirmação de entrega
            ...(texto.length > 160 && { format: 'full' }) // Envia como mensagem completa se for muito longa
        });

        console.info(`[INFO] Mensagem enviada para ${para}`);
        return response.data;
    } catch (error) {
        console.error('[ERRO] Falha ao enviar mensagem:', {
            numero: para,
            erro: error.message,
            stack: error.stack
        });
        // Propaga o erro para ser tratado pela função chamadora
        throw error;
    }
}

/**
 * Processa a mensagem recebida e decide a resposta (comandos internos ou IA)
 * @param {string} mensagemRecebida - Texto recebido do usuário
 * @returns {Promise<string>} Resposta para o usuário
 */
async function processarMensagem(mensagemRecebida, context) {
    console.debug('[DEBUG] Processando mensagem:', mensagemRecebida);

    // 1. Primeiro verifica comandos internos

    const msg = mensagemRecebida.toLowerCase().trim();
 
    const promptParaGemini = ` 
        SUA ÚNICA RESPOSTA DEVE SER UM OBJETO JSON VÁLIDO.
        NÃO INCLUA NENHUM TEXTO, SAUDAÇÃO OU FORMATAÇÃO ADICIONAL.

        Analise a "Frase do usuário" e defina a intenção.

        --- Intenção: Buscar Produto (API Tiny) ---
        Se a frase pedir para buscar um produto, retornar algo como:
        {
        "acao": "buscar_produto",
        "termo": "[termo que será usado na busca]" // Ex: "camisa preta"
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
    `; // Fecha a template string aqui

     let respostaIA;
    try {
        respostaIA = await chamarGeminiSDK(promptParaGemini);
    } catch (error) {
        console.error('[ERRO] Falha ao chamar Gemini para processar intenção:', error);
        return "Desculpe, não consegui entender sua intenção no momento. Poderia repetir?";
    }

   try {
        const dados = JSON.parse(respostaIA);

        if (dados.acao === "buscar_produto") {
            const termoBusca = dados.termo;
            if (!termoBusca) {
                return "Para buscar um produto, preciso de um termo para pesquisar. Qual produto você procura?";
            }

            const resultadoBusca = await buscarProdutoTiny(termoBusca);

            if (resultadoBusca.sucesso) {
                if (resultadoBusca.produtos.length > 0) {
                    let respostaProdutos = `🔎 Encontrei os seguintes produtos para "${termoBusca}":\n\n`;
                    resultadoBusca.produtos.forEach(produto => {
                        respostaProdutos += `* ${produto.nome} (ID: ${produto.id})\n`;
                        respostaProdutos += `  Preço: R$ ${produto.preco}\n`;
                        respostaProdutos += `  Estoque: ${produto.estoque}\n\n`;
                    });
                    respostaProdutos += "Posso ajudar com mais alguma busca?";
                    return respostaProdutos;
                } else {
                    return resultadoBusca.erro; // Mensagem de "Não encontrei nenhum produto" da função
                }
            } else {
                return resultadoBusca.erro; // Mensagem de erro da função (token ou erro de API)
            }
        } else if (dados.acao === "desconhecida") {
            return "Olá! Sou um assistente de busca de produtos. Por favor, me diga qual produto você gostaria de pesquisar e eu farei o meu melhor para ajudar!";
        } else {
            // Caso a IA retorne uma ação não prevista
            return "Desculpe, não consegui processar essa solicitação. Poderia perguntar sobre um produto?";
        }

    } catch (err) {
        console.error('[ERRO] IA não retornou JSON válido ou erro de processamento:', respostaIA, err);
        return "Tive dificuldade para entender sua pergunta. Pode repetir com outras palavras?";
    }
}



/**
 * Busca produtos na API do Tiny ERP.
 * @param {string} termoBusca - Termo a ser pesquisado (nome ou ID do produto).
 * @returns {Promise<object>} Um objeto com sucesso/erro e a lista de produtos encontrados ou mensagem de erro.
 */

async function buscarProdutoTiny(termoBusca) {
  if (!TINY_API_TOKEN || TINY_API_TOKEN === 'SEU_TOKEN_AQUI') {
        console.error("[ERRO] Por favor, insira o seu TINY_API_TOKEN no arquivo .env para continuar.");
        return { sucesso: false, erro: "O token da API Tiny não está configurado. Por favor, contate o administrador." };
    }
    try {
        
        const urlAPI = `https://api.tiny.com.br/api2/produtos.pesquisa.php`;
        const response = await axios.get(urlAPI, {
            params: {
                token: TINY_API_TOKEN,
                pesquisa: nomeOuId,
                formato: 'json'
            }
        });// aqui chamaremos pelo nome ou id
        const produtos = response.data.retorno.produtos;
         if (!produtos || produtos.length === 0) {
            console.log('[INFO] Nenhum produto encontrado para:', termoBusca);
            return [];
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

        return listaProdutos; /* return { sucesso: true, produtos: listaProdutos };*/

  

    } catch (error) {
        console.error('[ERRO] :', error.message);
         console.error('[ERRO] a api devolvel um erro:', error.message);
        return {
            sucesso: false,
        };
    }
}

/**
 * @param {number}quantidade
 * @param {string|null} tipo
 * @returns {promise<object>}
 */
/*
async function buscarSugestoesPokemon(quantidade = 1 ,tipo = null) {
    try{
        let pokemonNames = [];

        if(tipo){
            const typeUrl = `https://pokeapi.co/api/v2/type/${tipo.toLowerCase()}`;
            const typeRes = await axios.get(typeUrl);
            const pokemonsInType = typeRes.data.pokemon.map(p => p.pokemon.name);
            pokemonNames = pokemonsInType.slice(0,quantidade);

        }else {
            const allPokemonsUrl = `https://pokeapi.co/api/v2/pokemon?limit=${quantidade}`;
            const allPokemonsRes = await axios.get(allPokemonsUrl);
            pokemonNames = allPokemonsRes.data.results.map(p => p.name);

        }

        if (pokemonNames.length === 0){
            return { sucesso: false, erro: "Não consegui encontrar Pokémons com esses critérios." };

        }
        return { sucesso: true, nomes: pokemonNames };

    }catch (error) {
        console.error('[ERRO] buscarSugestoesPokemon:', error.message);
        // Retorna um erro amigável se o tipo não existir, por exemplo
        if (error.response && error.response.status === 404) {
             return { sucesso: false, erro: `Não encontrei o tipo "${tipo}". Verifique se o nome está correto.` };
        }
        return { sucesso: false, erro: "Ocorreu um erro ao buscar sugestões de Pokémon." };
    }
}*/

async function verificarConexaoGemini() {
    console.info('🔍 Verificando conexão com Google Gemini...');
    try {
        // Usa o modelo Gemini 2.0 Flash para um teste simples
        const testModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Corrigido o nome do modelo
        const result = await testModel.generateContent("Olá, Gemini. Responda apenas 'OK'");
        const response = await result.response;
        const text = response.text();

        const status = text.trim() === 'OK';
        console.info(status ? '✅ Conexão Google Gemini OK!' : '⚠️ Resposta inesperada do Gemini.');
        return status;
    } catch (error) {
        console.error('❌ Falha na conexão com Google Gemini:', error.message);
        return false;
    }
}

/**
 * Envia uma mensagem para todos os contatos individuais (DM)
 * @param {object} client - Instância do cliente WPPConnect.
 */
async function enviarParaContatosSeguro(client) {
    try {
        console.info('📋 Obtendo chats individuais para envio...');
        const chats = await client.getAllChats();
        const contatosIndividuais = chats.filter(chat => {
            // Filtra apenas chats individuais que não são de grupo e não são status
            return !chat.isGroup && !chat.isStatus;
        });

        console.info(`📋 ${contatosIndividuais.length} contatos individuais válidos encontrados.`);

        for (const contato of contatosIndividuais) {
            try {
                const mensagemParaEnviar = "Olá! Esta é uma mensagem de teste do meu bot. Como você está?"; // Personalize sua mensagem aqui
                console.info(`✉️ Enviando para: ${contato.name || contato.id.user}`);

                await client.sendText(
                    contato.id._serialized,
                    mensagemParaEnviar
                );

                // Delay importante para evitar bloqueio por flood
                await new Promise(resolve => setTimeout(resolve, 2500));

            } catch (error) {
                console.error(`[ERRO] Falha ao enviar para ${contato.id.user}:`, error.message);
            }
        }
        console.info('✅ Envio para todos os contatos concluído.');
    } catch (error) {
        console.error('[ERRO GERAL] Falha ao enviar para contatos:', error);
    }
}

// ==============================================
// INICIALIZAÇÃO DO SISTEMA
// ==============================================

// Declara a variável server fora do escopo do app.listen
let server;

// Inicia o servidor Express
server = app.listen(port, async () => { // Atribui a instância do servidor à variável server
    console.info(`🚀 Servidor rodando na porta ${port}`);
    console.info(`Modo: ${process.env.NODE_ENV || 'desenvolvimento'}`);
    console.info(`Modelo IA: gemini-2.0-flash`); // Agora é fixo para Gemini 2.0 Flash

    // 1. Verifica a conexão com o Google Gemini antes de iniciar o WhatsApp
    const geminiStatus = await verificarConexaoGemini();
    if (!geminiStatus) {
        console.error('❌ Não foi possível estabelecer conexão com o Google Gemini. O bot de IA não funcionará.');
        // Você pode optar por encerrar o processo aqui se a IA for essencial: process.exit(1);
    }

    // 2. Inicia a sessão do WPPConnect
    create({
        session: 'whatsapp-bot', // Nome da sessão do WhatsApp
        headless: true, // Roda o navegador em segundo plano
        puppeteerOptions: { args: ['--no-sandbox'] }, // Necessário para alguns ambientes
        disableWelcome: true, // Desativa a mensagem de boas-vindas
        logQR: true, // Mostra o QR Code no console
        catchQR: (base64Qr, asciiQR) => {
            console.info('=== ESCANEIE O QR CODE PARA CONECTAR ===');
            console.info(asciiQR); // QR Code em texto para escanear
        },
        statusFind: (statusSession) => {
            console.info('Status da sessão WhatsApp:', statusSession);
        },
        onLoading: (percent, message) => {
            console.info(`Carregando WhatsApp: ${percent}% - ${message}`);
        },
        // Configurações para ignorar status e evitar verificações desnecessárias
        updateCheckInterval: 0,
        disableAutoStatus: true,
        disableAutoStatusSave: true
    })
    .then((client) => {
        console.info('✅ WhatsApp conectado com sucesso!');
         
            function mensagemAtual(message, limiteMinutos = 5) {
            const momento = Date.now(); // em ms
            const limite = limiteMinutos * 60 * 1000; // 5 min em ms
            return (momento - (message.timestamp * 1000)) < limite; // converte timestamp para ms
             }
        // Handler de mensagens recebidas
        client.onMessage(async (message) => {
            if (!mensagemAtual(message)) {
             console.debug(`[INFO] Mensagem antiga ignorada de ${message.from}`);
             return;
            }
            // Verifica se é mensagem de grupo, status ou newsletter
            const isNewsletter = message.from.endsWith('@newsletter'); // Verifica se é newsletter
            if (message.isGroupMsg || message.isStatus || isNewsletter ||  !message.body || message.body.trim() === '') {
        console.debug(`Mensagem ignorada: De ${message.from} (Tipo: ${message.isGroupMsg ? 'Grupo' : message.isStatus ? 'Status' : isNewsletter ? 'Newsletter' : 'Vazia/Sem Corpo'}) | Conteúdo: ${message.body?.substring(0, 50) || 'N/A'}`);
        
        return; // Sai da função, não processa a mensagem
            }

            console.info(`[MENSAGEM RECEBIDA] De: ${message.from} (${message.sender?.name || 'sem nome'}) | Conteúdo: ${message.body}`);
            const context = getUserContext(message.from);

            try {
                // Processa a mensagem e obtém a resposta da IA ou comando interno
                  const resposta = await processarMensagem(message.body, context); // <-- AQUI
                // Envia a resposta de volta ao usuário
                await client.sendText(message.from, resposta);
                console.info(`[INFO] Resposta enviada para ${message.from}`);
            } catch (error) {
                console.error('[ERRO] Falha ao processar ou enviar resposta:', error);
                // Tenta enviar uma mensagem de erro genérica para o usuário
                await client.sendText(message.from, 'Ops, tive um probleminha para te responder. Tente novamente mais tarde!');
            }
        });
    })
    .catch((err) => {
        console.error('❌ Erro crítico ao iniciar WPPConnect:', err);
        process.exit(1); // Encerra o processo se o WhatsApp não puder iniciar
    });
});

// Tratamento de encerramento gracioso do servidor Node.js
process.on('SIGINT', () => {
    console.info('\n🔴 Recebido SIGINT. Encerrando servidor...');
    server.close(() => {
        console.info('Servidor encerrado.');
        process.exit(0);
    });
});
