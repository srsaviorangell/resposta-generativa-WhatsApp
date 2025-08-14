// Remova este arquivo se o seu projeto for um arquivo único

const axios = require('axios');
const querystring = require('querystring');

const TINY_API_TOKEN = '2087de22efa35b14ce562279a50555faca902d77ffa4c48d7ec620cda77cb0c3';

async function consultarEstoque(idProduto) {
  if (!TINY_API_TOKEN || TINY_API_TOKEN === 'SEU_TOKEN_AQUI') {
    console.error('[ERRO] Insira seu token Tiny API no código.');
    return null;
  }

  const url = 'https://api.tiny.com.br/api2/produto.obter.estoque.php';
  const body = querystring.stringify({
    token: TINY_API_TOKEN,
    id: idProduto,
    formato: 'json'
  });

  try {
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const data = response.data;
    
    if (data?.retorno?.status !== 'OK') {
      // Lógica aprimorada para capturar a mensagem de erro correta
      const mensagemErro = data?.retorno?.erros?.[0]?.erro || data?.retorno?.mensagem || 'Erro desconhecido da API.';
      
      console.error(`[ERRO] na consulta do estoque para o ID ${idProduto}:`, mensagemErro);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[ERRO] Falha na comunicação com a API Tiny:', error.message);
    return null;
  }
}
module.exports = { consultarEstoque };