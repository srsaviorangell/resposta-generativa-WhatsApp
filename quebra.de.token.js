const fs = require('fs');

// Função para tokenizar strings
function tokenizarStringAvancada(texto) {
    return texto
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove pontuação
        .trim()
        .split(/\s+/);
}

// Função para ler, tokenizar e salvar novo JSON
function tokenizarArquivoJSON(entrada, saida) {
    try {
        const conteudo = fs.readFileSync(entrada, 'utf-8');
        const json = JSON.parse(conteudo);

        const resultado = {};

        for (const chave in json) {
            const valor = json[chave];
            if (typeof valor === 'string') {
                resultado[chave] = tokenizarStringAvancada(valor);
            } else {
                resultado[chave] = valor;
            }
        }

        fs.writeFileSync(saida, JSON.stringify(resultado, null, 2), 'utf-8');
        console.log(`✅ Arquivo salvo com sucesso: ${saida}`);
    } catch (erro) {
        console.error('❌ Erro ao processar o JSON:', erro.message);
    }
}

// Chamada de exemplo
tokenizarArquivoJSON('entrada.json', 'saida_tokenizada.json');

