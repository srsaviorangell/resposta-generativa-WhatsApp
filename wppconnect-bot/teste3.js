// Importa a biblioteca axios para fazer requisições HTTP
require('axios'); // ✅
const fs = require('fs');

const axios = require('axios');
const TINY_API_TOKEN = '2087de22efa35b14ce562279a50555faca902d77ffa4c48d7ec620cda77cb0c3'; // <--- COLOQUE SEU TOKEN AQUI

/**
 * Busca as informações completas do Pokémon na PokéAPI
 * @param {string} nome - Nome do Pokémon em minúsculas (ex: "pikachu")
 * @returns {Promise<object>} - Objeto com dados do Pokémon ou erro
 */
async function buscaDadosAPI(nomeOuId) {
    try {
        if (TINY_API_TOKEN === 'SEU_TOKEN_AQUI' || !TINY_API_TOKEN) {
        console.error("[ERRO] Por favor, insira o seu TINY_API_TOKEN no código para continuar.");
        return;
    }
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

        return listaProdutos


    } catch (error) {
        console.error('[ERRO] :', error.message);
         console.error('[ERRO] a api devolvel um erro:', error.message);
        return {
            sucesso: false,
        };
    }
}


async function main() {
    try {
        const produtos = await buscaDadosAPI('cuba');

        if (produtos.length === 0) {
            console.log('Nenhum produto encontrado.');
            return;
        }

        console.log(`Foram encontrados ${produtos.length} produtos.\nSalvando em produtos.json...`);

        // 🔥 Salvando o arquivo JSON
        fs.writeFileSync('produtos.json', JSON.stringify(produtos, null, 2), 'utf-8');

        console.log('✅ Arquivo produtos.json salvo com sucesso!');

    } catch (e) {
        console.error('[ERRO] na função main:', e.message);
    }
}

main();
    
