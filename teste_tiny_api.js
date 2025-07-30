

// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');

// IMPORTANTE: Cole aqui o seu Token da API do Tiny ERP
const TINY_API_TOKEN = '2087de22efa35b14ce562279a50555faca902d77ffa4c48d7ec620cda77cb0c3'; // <--- COLOQUE SEU TOKEN AQUI

/**
 * Busca produtos por nome na API do Tiny ERP.
 * @param {string} nomeProduto - O nome do produto a ser pesquisado (ex: "cuba")
 * @returns {Promise<void>}
 */
async function buscarProdutoNoTiny(nomeProduto) {
    // Verifica se o token foi inserido
    if (TINY_API_TOKEN === 'SEU_TOKEN_AQUI' || !TINY_API_TOKEN) {
        console.error("[ERRO] Por favor, insira o seu TINY_API_TOKEN no código para continuar.");
        return;
    }

    console.log(`Buscando por "${nomeProduto}" na API do Tiny ERP...`);

    // AQUI ESTÁ A CORREÇÃO: "produto" foi trocado por "produtos"
    const url = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
    const params = {
        token: TINY_API_TOKEN,
        pesquisa: nomeProduto,
        formato: 'json'
    };

    try {
        const response = await axios.get(url, { params });
        const retorno = response.data.retorno;

        // Verifica se a API retornou um erro
        if (retorno.status === 'ERRO') {
            const erroMsg = retorno.erros ? retorno.erros[0] : 'Erro desconhecido na API.';
            console.error(`[ERRO NA API] ${erroMsg}`);
            return;
        }

        const produtos = retorno.produtos;

        if (produtos && produtos.length > 0) {
            console.log(`\n✅ Sucesso! Encontrei ${produtos.length} produto(s):`);
            produtos.forEach(item => {
                const prod = item.produto;
                console.log('------------------------------------');
                console.log(`  Nome: ${prod.nome}`);
                console.log(`  ID: ${prod.id}`);
                console.log(`  Preço: R$ ${parseFloat(prod.preco).toFixed(2)}`);
                console.log(`  Estoque: ${parseInt(prod.saldo)}`);
            });
        } else {
            console.log(`\nℹ️ Nenhum produto encontrado com o nome "${nomeProduto}".`);
        }

    } catch (error) {
        console.error('\n[ERRO FATAL] Ocorreu um problema ao tentar se comunicar com a API do Tiny.');
        console.error('Detalhes:', error.message);
    }
}

// --- Execução do Teste ---
// A função principal que chama a busca com o termo "cuba"
async function main() {
    await buscarProdutoNoTiny('cutelo');
}

main();