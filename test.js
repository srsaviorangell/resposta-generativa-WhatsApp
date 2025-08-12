const { consultarEstoque } = require('./wppconnect-bot/teste_tiny_api.js');

const axios = require('axios');
const fs = require('fs');
const querystring = require('querystring');

const TINY_API_TOKEN = '2087de22efa35b14ce562279a50555faca902d77ffa4c48d7ec620cda77cb0c3';

async function buscaDadosAPI(nomeOuId) {
  try {
    if (TINY_API_TOKEN === 'SEU_TOKEN_AQUI' || !TINY_API_TOKEN) {
      console.error("[ERRO] Por favor, insira o seu TINY_API_TOKEN no código para continuar.");
      return [];
    }

    const urlAPI = `https://api.tiny.com.br/api2/produtos.pesquisa.php`;
    const response = await axios.get(urlAPI, {
      params: {
        token: TINY_API_TOKEN,
        pesquisa: nomeOuId,
        formato: 'json'
      }
    });

    const produtos = response.data?.retorno?.produtos;

    if (!produtos || produtos.length === 0) {
      console.log('[INFO] Nenhum produto encontrado para:', nomeOuId);
      return [];
    }

    const listaProdutos = produtos.map(item => {
      const dados = item.produto;
      return {
        nome: dados.nome,
        id: dados.id,
        preco: dados.preco
      };
    });

   const listaProdutosComEstoque = [];
        for (const item of listaProdutos) {
            const responseEstoque = await consultarEstoque(item.id);
            const saldoEstoque = responseEstoque?.retorno?.produto?.saldo ?? 'Sem info';
            
            listaProdutosComEstoque.push({
                nome: item.nome,
                id: item.id,
                preco: item.preco,
                estoque: saldoEstoque
            });
        }
        // =========================================================

        return listaProdutosComEstoque;

    

  } catch (error) {
    console.error('[ERRO] na função buscaDadosAPI:', error.message);
    return [];
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

    fs.writeFileSync('pika.json', JSON.stringify(produtos, null, 2), 'utf-8');

    console.log('✅ Arquivo produtos.json salvo com sucesso!');

  } catch (e) {
    console.error('[ERRO] na função main:', e.message);
  }
}

main();
