const axios = require('axios');
const fs = require('fs');
const querystring = require('querystring');
const TINY_API_TOKEN = '2087de22efa35b14ce562279a50555faca902d77ffa4c48d7ec620cda77cb0c3';


/**
 * Consulta o estoque de um produto pelo ID usando a API Tiny 2.0
 * @param {number|string} idProduto - ID do produto no Tiny
 */
async function consultarEstoque(idProduto) {
    if (!TINY_API_TOKEN || TINY_API_TOKEN === 'SEU_TOKEN_AQUI') {
        console.error('[ERRO] Insira seu token Tiny API no código.');
        return;
    }

    const url = 'https://api.tiny.com.br/api2/produto.obter.estoque.php';

    const body = querystring.stringify({
        token: TINY_API_TOKEN,
        id: idProduto,
        formato: 'json'
    });

    try {
        console.log(`🔎 Consultando estoque do produto ID ${idProduto}...`);

        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = response.data;

        // Salvar resultado em arquivo JSON
        const nomeArquivo = `teste${idProduto}.json`;
        fs.writeFileSync(nomeArquivo, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`📁 Resultado salvo em arquivo: ${nomeArquivo}`);

        if (data?.retorno?.status !== 'OK') {
            console.error('[ERRO] A API retornou um erro:', data?.retorno?.mensagem || 'Erro desconhecido');
            return;
        }

        const produto = data.retorno.produto;

        console.log('\n✅ Estoque do produto:');
        console.log(`Nome: ${produto.nome}`);
        console.log(`Código: ${produto.codigo}`);
        console.log(`Saldo total: ${produto.saldo}`);
        console.log(`Saldo reservado: ${produto.saldoReservado}`);
        console.log(`Disponível: ${produto.saldo - produto.saldoReservado}`);

        if (produto.depositos && produto.depositos.length > 0) {
            console.log('\n📦 Estoque por depósito:');
            produto.depositos.forEach(deposito => {
                const d = deposito.deposito;
                console.log(`- Depósito: ${d.nome} | Saldo: ${d.saldo} | Reservado: ${d.reservado} | Disponível: ${d.saldo - d.reservado}`);
            });
        }

    } catch (error) {
        console.error('[ERRO] Falha na comunicação com a API Tiny:', error.message);
    }
}

// Exemplo de uso: colocar o ID real do produto Tiny aqui
const idProdutoTeste = 973489105;
consultarEstoque(idProdutoTeste);