
const fs = require('fs');
const caminho = './wppconnect-bot/produtos.json';
const conteudo = fs.readFileSync(caminho, 'utf-8');
const jsonParaJs = JSON.parse(conteudo);


// Função para tokenizar strings
function tokenizarStringAvancada(JsonParaJs) { 
       return JsonParaJs
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove pontuação
        .trim()
        .split(/\s+/);
}

const resultadoTokenizado = jsonParaJs.map((item, index) => {
    const nome = item.nome || '';
    const tokens = tokenizarStringAvancada(nome);
    return { ...item, tokens }; // adiciona o array de tokens ao objeto original
});

// Salva o resultado em um novo arquivo JSON
fs.writeFileSync(
    './wppconnect-bot/produtos-tokenizados.json',
    JSON.stringify(resultadoTokenizado, null, 2),
    'utf-8'
);

console.log('Arquivo produtos-tokenizados.json criado com sucesso!');