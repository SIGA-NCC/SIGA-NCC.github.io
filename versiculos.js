// Versículos do app (D5 — tom de acolhimento, igreja).
// Lista fixa no front: não pesa chamada de rede e funciona offline.
// `tema` liga o versículo ao momento: dar | servir | gratidao | provisao.

export const VERSICULOS = [
  { texto: 'Porque tive fome, e me destes de comer; tive sede, e me destes de beber.', ref: 'Mateus 25:35', tema: 'servir' },
  { texto: 'Cada um conforme propôs no seu coração; não com tristeza, nem por necessidade; porque Deus ama ao que dá com alegria.', ref: '2ª Coríntios 9:7', tema: 'dar' },
  { texto: 'Misericordioso e compassivo é o Senhor.', ref: 'Salmos 103:8', tema: 'gratidao' },
  { texto: 'Feliz o que tem consideração do necessitado e do pobre; no dia mau o Senhor o livrará.', ref: 'Salmos 41:1', tema: 'servir' },
  { texto: 'Parte o teu pão com o faminto, e traz o pobre errante para a tua casa.', ref: 'Isaías 58:7', tema: 'dar' },
  { texto: 'Dai, e ser-vos-á dado; boa medida, calcada, transbordando e sacudindo vos darão no vosso regaço.', ref: 'Lucas 6:38', tema: 'dar' },
  { texto: 'Aquele que tem misericórdia do pobre empresta ao Senhor, que lhe recompensará o que bem fizer.', ref: 'Provérbios 19:17', tema: 'dar' },
  { texto: 'E o meu Deus suprirá todas as vossas necessidades segundo a sua riqueza, em glória, em Cristo Jesus.', ref: 'Filipenses 4:19', tema: 'provisao' },
  { texto: 'Bom é o Senhor para com os que nele esperam, para com a alma que o busca.', ref: 'Lamentações 3:25', tema: 'provisao' },
  { texto: 'Não te esqueças de fazer o bem e de repartir os teus bens; porque tais sacrifícios são agradáveis a Deus.', ref: 'Hebreus 13:16', tema: 'dar' },
  { texto: 'O Senhor é o meu pastor, nada me faltará.', ref: 'Salmos 23:1', tema: 'provisao' },
  { texto: 'Pois ele dessedenta a alma sedenta, e enche de bens a alma faminta.', ref: 'Salmos 107:9', tema: 'provisao' },
  { texto: 'Eu sou o pão da vida; aquele que vem a mim não terá fome, e quem crê em mim nunca terá sede.', ref: 'João 6:35', tema: 'provisao' },
  { texto: 'Provai e vede que o Senhor é bom; bem-aventurado o homem que nele confia.', ref: 'Salmos 34:8', tema: 'gratidao' },
  { texto: 'Louvai ao Senhor, porque ele é bom, porque a sua benignidade dura para sempre.', ref: 'Salmos 136:1', tema: 'gratidao' },
  { texto: 'Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.', ref: '1ª Tessalonicenses 5:18', tema: 'gratidao' },
  { texto: 'O que tem os olhos bondosos será abençoado, porque deu do seu pão ao pobre.', ref: 'Provérbios 22:9', tema: 'dar' },
  { texto: 'A alma generosa será engordada, e o que regar também será regado.', ref: 'Provérbios 11:25', tema: 'dar' },
  { texto: 'Mais bem-aventurada coisa é dar do que receber.', ref: 'Atos 20:35', tema: 'dar' },
  { texto: 'Levai as cargas uns dos outros, e assim cumprireis a lei de Cristo.', ref: 'Gálatas 6:2', tema: 'servir' },
  { texto: 'E não nos cansemos de fazer bem, porque a seu tempo ceifaremos, se não houvermos desfalecido.', ref: 'Gálatas 6:9', tema: 'servir' },
  { texto: 'Meus filhinhos, não amemos de palavra, nem de língua, mas por obra e em verdade.', ref: '1ª João 3:18', tema: 'servir' },
  { texto: 'Comunicai com os santos nas suas necessidades, segui a hospitalidade.', ref: 'Romanos 12:13', tema: 'servir' },
  { texto: 'E tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor, e não aos homens.', ref: 'Colossenses 3:23', tema: 'servir' },
  { texto: 'Cada um, conforme o dom que recebeu, administre-o aos outros, como bons despenseiros da multiforme graça de Deus.', ref: '1ª Pedro 4:10', tema: 'servir' },
  { texto: 'Assim resplandeça a vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem a vosso Pai, que está nos céus.', ref: 'Mateus 5:16', tema: 'servir' },
  { texto: 'Livremente abrirás a tua mão para o teu irmão, para o teu aflito e para o teu necessitado na tua terra.', ref: 'Deuteronômio 15:11', tema: 'dar' },
  { texto: 'E, se derramares a tua alma ao faminto, e fartares a alma aflita, então a tua luz nascerá nas trevas.', ref: 'Isaías 58:10', tema: 'dar' },
  { texto: 'Quem tiver duas túnicas, que reparta com o que não tem; e quem tiver alimentos, faça da mesma maneira.', ref: 'Lucas 3:11', tema: 'dar' },
  { texto: 'Antes sede uns para com os outros benignos, misericordiosos, perdoando-vos uns aos outros, como também Deus vos perdoou em Cristo.', ref: 'Efésios 4:32', tema: 'servir' },
  { texto: 'Não te furtes a fazer o bem a quem o merece, estando no poder da tua mão fazê-lo.', ref: 'Provérbios 3:27', tema: 'servir' },
  { texto: 'O que se compadece do necessitado honra aquele que o criou.', ref: 'Provérbios 14:31', tema: 'servir' },
  { texto: 'Porque Deus não é injusto para se esquecer da vossa obra e do trabalho de amor que para com o seu nome mostrastes.', ref: 'Hebreus 6:10', tema: 'gratidao' },
  { texto: 'Sede firmes e constantes, sempre abundantes na obra do Senhor, sabendo que o vosso trabalho não é vão no Senhor.', ref: '1ª Coríntios 15:58', tema: 'gratidao' }
];

// Índice estável por data: o mesmo versículo o dia todo, troca na meia-noite.
export function versiculoDoDia() {
  const dia = Math.floor(Date.now() / 86400000);
  return VERSICULOS[dia % VERSICULOS.length];
}

// Sorteia um versículo do tema, evitando repetir o que já está na tela.
export function versiculoDoTema(tema, evitar) {
  const pool = VERSICULOS.filter(v => v.tema === tema && v !== evitar);
  const base = pool.length ? pool : VERSICULOS.filter(v => v !== evitar);
  return base[Math.floor(Math.random() * base.length)];
}

// Próximo na lista (rodízio sem repetir enquanto não der a volta).
export function proximoVersiculo(atual) {
  const i = VERSICULOS.indexOf(atual);
  return VERSICULOS[(i + 1) % VERSICULOS.length];
}
