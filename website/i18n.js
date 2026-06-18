// EN/PT i18n for the BlockBuilder Studio website.
// Linked from every public page (after nav.css). Reads the user's stored
// preference or browser language on first paint, walks the DOM, swaps every
// [data-i18n="key"] element's innerHTML to the matching translation.
//
// Default HTML stays in English so non-JS visitors + search-engine crawlers
// still see EN content (preserves the EN ranking the site already has).
// PT visitors see PT after the script runs.
//
// Keep dictionary keys flat and namespaced: nav.* footer.* landing.* pricing.*
// install.* features.* tutorials.*

const DICT = {
  en: {
    // === Shared (nav + footer) =========================================
    'nav.features':  'Features',
    'nav.tutorials': 'Tutorials',
    'nav.install':   'Install',
    'nav.pricing':   'Pricing &amp; FAQ',
    'nav.changelog': 'Changelog',
    'nav.try':       'Try in browser',
    'nav.download':  'Download free',
    'footer.copy':   '&copy; 2026 Marjers',
    'footer.privacy': 'Privacy',

    // === Landing =======================================================
    'landing.title': 'BlockBuilder Studio · Model in minutes. Print the same day.',
    'landing.hero.os': 'Offline 3D editor · Desktop · iPad · iPhone · Android',
    'landing.hero.h1.l1': 'Model in',
    'landing.hero.h1.l2': 'minutes.',
    'landing.hero.h1.l3': 'Print the same day.',
    'landing.hero.lede': 'Drag a primitive. <strong>Push/pull any face</strong>, including slanted. Combine with full Boolean CSG. Drop reference planes, sketch outlines, revolve a lathe profile. Export STL, OBJ or STEP. All offline, on every screen you own.',
    'landing.hero.cta.download': 'Download for <span id="hero-os">your OS</span>',
    'landing.hero.cta.workflow': 'See workflow',
    'landing.hero.perk.free':     'Free for personal use',
    'landing.hero.perk.no':       'No account, no email',
    'landing.hero.perk.offline':  'Works offline',
    'landing.hero.perk.signed':   'Signed binaries',
    'landing.hero.stat.version':  'Released June 2026',
    'landing.hero.stat.prims':    'Primitive shapes',
    'landing.hero.stat.sketch':   'Sketch tools &middot; Extrude &middot; Scribble &middot; Revolve',
    'landing.hero.stat.tracking': 'Tracking pixels',

    'landing.trust.signed':   'Code-signed binaries',
    'landing.trust.telemetry':'Zero telemetry',
    'landing.trust.local':    'Files stay on your disk',
    'landing.trust.free':     'Free forever, personal use',

    'landing.feat.eyebrow':   'What v0.6 brought',
    'landing.feat.h2':        'Direct modelling that finally <span class="serif">feels like CAD.</span>',
    'landing.feat.p':         'Push/Pull on any face including slanted ones. Reference planes, axes, midpoints. Sketch + Revolve. Pattern with skip-list. Live-scrub sliders. Edge-hover dimensions. Maths in every number field. Ten new moves in v0.6 that no browser modeler has.',
    'landing.feat.cta':       'See every feature &rarr;',

    'landing.shots.eyebrow':  'Real screenshots',
    'landing.shots.h2':       'This is what it <span class="serif">actually looks like.</span>',
    'landing.shots.p':        'No mockups, no hand-drawn figures. The real app, real geometry, real exported STLs.',

    'landing.workflow.eyebrow':'Workflow',
    'landing.workflow.h2':    'From idea to printable STL<br><span class="serif">in four steps.</span>',
    'landing.workflow.p':     'Five minutes from first launch to a printed bracket. No tutorial required, but eighty-five short ones wait at <a href="/tutorials" style="color: var(--lime); text-decoration: none;">/tutorials</a> if you want them.',
    'landing.workflow.s1.h':  'Drop in a shape',
    'landing.workflow.s1.p':  'Drag any of the <strong style="color:var(--text)">13 primitives</strong> from the left panel. <strong style="color:var(--text)">Live-scrub</strong> any slider in Properties to morph the shape in real time. Type <code>2*12+4</code> into any field, it evaluates.',
    'landing.workflow.s2.h':  'Combine with CSG',
    'landing.workflow.s2.p':  'Group (<kbd>Ctrl</kbd>+<kbd>G</kbd>), Hole (subtract), Intersect (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>). Full Boolean stack, reversible until you <strong style="color:var(--text)">Bake</strong>.',
    'landing.workflow.s3.h':  'Push/Pull on any face',
    'landing.workflow.s3.p':  'Click any face, even a 30&deg; slant on a Wedge, drag away. A new prism extrudes along that face\'s normal. Add chamfers, fillets, hollow shells, arrays with skip-list, all in a few clicks.',
    'landing.workflow.s4.h':  'Export &middot; slice &middot; print',
    'landing.workflow.s4.p':  'Click <strong style="color:var(--text)">STL</strong>, <strong style="color:var(--text)">OBJ</strong>, or <strong style="color:var(--text)">STEP AP203</strong>. Open in Bambu Studio, Cura, PrusaSlicer, or import into Fusion. Done.',

    'landing.power.eyebrow':  'Power tools &middot; v0.6',
    'landing.power.h2':       'Not just blocks.<br><span class="serif">Real CAD moves without the menus.</span>',
    'landing.power.p':        'Six features that put BlockBuilder ahead of Tinkercad\'s web app. Watch each in &lt;30 seconds at <a href="/tutorials" style="color: var(--lime); text-decoration: none;">/tutorials</a>.',
    'landing.power.c1.h':     'Push / Pull on any face',
    'landing.power.c1.p':     'Click a face, even a slanted one on a Wedge or Pyramid lateral, then drag away. A new prism extrudes along that face\'s normal. The 30&deg; wall finally gets its tab in one gesture.',
    'landing.power.c2.h':     'Reference geometry',
    'landing.power.c2.p':     'Drop a translucent <strong style="color:var(--text)">plane through 3 picked points</strong>, an axis along any edge, a midpoint marker on any edge. Snap body-drag and resize handles to them. Promote any plane to the active workplane.',
    'landing.power.c3.h':     'Sketch + Revolve',
    'landing.power.c3.p':     'Click points to draw a polygon, hit Enter, it extrudes. Or hold the mouse and <strong style="color:var(--text)">scribble freehand</strong>, the outline closes and extrudes. Or sketch a 2D profile and <strong style="color:var(--text)">revolve it 360&deg;</strong> for vases, bottles, funnels.',
    'landing.power.c4.h':     'Pattern v2 with Skip',
    'landing.power.c4.p':     'Linear or circular arrays, then type <code>3, 7, 9</code> into the Skip field and those copies drop out. Hex grids with a missing centre, masonry with feature gaps, all in one step instead of duplicate-and-delete.',
    'landing.power.c5.h':     'Edge-hover dimensions',
    'landing.power.c5.p':     'Move the cursor near any feature edge. A label pops up with the edge\'s exact length. Hidden triangulation diagonals are filtered out, only the edges you can actually see. Plus a Ruler tool for two-point distance.',
    'landing.power.c6.h':     'Touch-tuned on mobile',
    'landing.power.c6.p':     'Floating <strong style="color:var(--text)">rail UI</strong> on tablets (Shapr3D-style), <strong style="color:var(--text)">bottom dock</strong> on phones (Womp-style), <strong style="color:var(--text)">long-press radial</strong> for Duplicate / Hide / Group / Delete. Touch handles are 1.6&times; bigger so fingertips hit them.',
    'landing.power.note':     'Also new in v0.6: <strong style="color:var(--text)">Intersect boolean</strong>, dimension overlay, math in any number field (<code>2*12+4</code>, <code>sqrt(50)</code>), <strong style="color:var(--text)">Chamfer + Fillet on 10 primitives</strong>, neighbour-snap on resize handles, shortcut palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>), STEP AP203 export. <a href="/features" style="color: var(--lime);">Read the full list &rarr;</a>',

    'landing.promises.eyebrow': 'What you get',
    'landing.promises.h2':    'Six promises. <span class="serif">No fine print.</span>',
    'landing.promises.p':     'Same commitments for the free version and the licensed one. Same software, same code, same respect.',
    'landing.promises.p1.h':  'Fully offline',
    'landing.promises.p1.p':  'The app never makes a network request once installed. Plane, air-gapped workstation, caf&eacute; Wi-Fi outage, same behaviour.',
    'landing.promises.p2.h':  'No accounts, ever',
    'landing.promises.p2.p':  'No sign-up. No email confirmation. No "verify your identity". Install and use. Commercial licences are verified offline against the local file.',
    'landing.promises.p3.h':  'No upload limits',
    'landing.promises.p3.p':  'Imports happen locally. Bring in a 500 MB STL with 5M triangles, your RAM is the only limit. BVH-accelerated picking handles it.',
    'landing.promises.p4.h':  'Your files stay yours',
    'landing.promises.p4.p':  'Saves are plain JSON on your disk. STL exports land in <code>Downloads/</code>. Nothing leaves your machine unless you share it.',
    'landing.promises.p5.h':  'No tracking',
    'landing.promises.p5.p':  'Zero telemetry. Zero analytics. Zero cookies. The app doesn\'t know you exist after install. This website doesn\'t either.',
    'landing.promises.p6.h':  'No subscription',
    'landing.promises.p6.p':  'Personal use is free forever. Commercial licence is <strong style="color:var(--text)">&euro;12 once</strong>, lifetime, every future update included until v1.0+.',

    'landing.uses.eyebrow':   'Use cases',
    'landing.uses.h2':        'Built for the work, <br><span class="serif">not the workflow.</span>',
    'landing.uses.p':         'What people actually make with BlockBuilder.',
    'landing.uses.tag.print': '3D printing',
    'landing.uses.tag.proto': 'Prototyping',
    'landing.uses.tag.edu':   'Education',
    'landing.uses.tag.maker': 'Makers',
    'landing.uses.tag.remix': 'Remixers',
    'landing.uses.tag.table': 'Tabletop',
    'landing.uses.u1.h':      'Custom replacement parts',
    'landing.uses.u1.p':      'Bracket broke? Cabinet handle missing? Measure with a calliper, model in 5 minutes, print in 30.',
    'landing.uses.u2.h':      'Idea to mock in an afternoon',
    'landing.uses.u2.p':      'Faster than Fusion for blocky designs. Move to parametric CAD once the proportions feel right.',
    'landing.uses.u3.h':      'Classroom 3D without logins',
    'landing.uses.u3.p':      'No student accounts to set up, no schoolwide trust forms. Each PC runs its own instance.',
    'landing.uses.u4.h':      'Jigs, fixtures, organisers',
    'landing.uses.u4.p':      'Custom boxes, tool holders, drawer dividers, GoPro mounts. The boring practical stuff 3D printing is best at.',
    'landing.uses.u5.h':      'Edit imported STLs',
    'landing.uses.u5.p':      'Pull a model off Printables, scale it, slice a section, drill a hole, re-export. No 25 MB upload cap.',
    'landing.uses.u6.h':      'Bases &middot; terrain &middot; props',
    'landing.uses.u6.p':      'Hex bases, ruined walls, simple miniatures. Star + polygon + extrude get you 80% of the way.',

    'landing.devices.eyebrow':'One app, every screen',
    'landing.devices.h2':     'On your desk.<br><span class="serif">On your iPad.</span><br>On the bus on your phone.',
    'landing.devices.p':      'Same project, same tools, same STL out the other end. No account, no cloud sync, no compromises per device.',
    'landing.devices.cap.dt': 'Desktop &middot; Windows / macOS / Linux',
    'landing.devices.cap.tb': 'iPad &amp; Android tablets &middot; rail UI',
    'landing.devices.cap.ph': 'iPhone &amp; Android &middot; dock UI',
    'landing.devices.cta':    'Open in your browser, on any device &rarr;',
    'landing.devices.note':   'Works offline after the first visit. Add to Home Screen for a real app icon.',

    'landing.final.h2':       'Ready to <span class="accent serif">model?</span>',
  },
  pt: {
    // === Shared (nav + footer) =========================================
    'nav.features':  'Funcionalidades',
    'nav.tutorials': 'Tutoriais',
    'nav.install':   'Instalar',
    'nav.pricing':   'Pre&ccedil;os e FAQ',
    'nav.changelog': 'Notas de vers&atilde;o',
    'nav.try':       'Abrir no browser',
    'nav.download':  'Descarregar gr&aacute;tis',
    'footer.copy':   '&copy; 2026 Marjers',
    'footer.privacy':'Privacidade',

    // === Landing =======================================================
    'landing.title': 'BlockBuilder Studio &middot; Modelar em minutos. Imprimir no mesmo dia.',
    'landing.hero.os': 'Editor 3D offline &middot; Desktop &middot; iPad &middot; iPhone &middot; Android',
    'landing.hero.h1.l1': 'Modela em',
    'landing.hero.h1.l2': 'minutos.',
    'landing.hero.h1.l3': 'Imprime no mesmo dia.',
    'landing.hero.lede': 'Arrasta uma primitiva. <strong>Push/pull em qualquer face</strong>, mesmo inclinadas. Combina com Booleanos CSG completos. Coloca planos de refer&ecirc;ncia, esbo&ccedil;a contornos, faz revolve num torno. Exporta STL, OBJ ou STEP. Tudo offline, em todos os ecr&atilde;s que tens.',
    'landing.hero.cta.download': 'Descarregar para <span id="hero-os">o teu OS</span>',
    'landing.hero.cta.workflow': 'Ver o fluxo de trabalho',
    'landing.hero.perk.free':     'Gr&aacute;tis para uso pessoal',
    'landing.hero.perk.no':       'Sem conta, sem email',
    'landing.hero.perk.offline':  'Funciona offline',
    'landing.hero.perk.signed':   'Bin&aacute;rios assinados',
    'landing.hero.stat.version':  'Lan&ccedil;ado em Junho 2026',
    'landing.hero.stat.prims':    'Formas primitivas',
    'landing.hero.stat.sketch':   'Ferramentas de esbo&ccedil;o &middot; Extrudir &middot; Rabiscar &middot; Revolver',
    'landing.hero.stat.tracking': 'P&iacute;xeis de rastreio',

    'landing.trust.signed':   'Bin&aacute;rios assinados',
    'landing.trust.telemetry':'Zero telemetria',
    'landing.trust.local':    'Ficheiros ficam no teu disco',
    'landing.trust.free':     'Gr&aacute;tis para sempre, uso pessoal',

    'landing.feat.eyebrow':   'O que o v0.6 trouxe',
    'landing.feat.h2':        'Modela&ccedil;&atilde;o directa que finalmente <span class="serif">sabe a CAD.</span>',
    'landing.feat.p':         'Push/Pull em qualquer face, mesmo inclinadas. Planos, eixos e pontos m&eacute;dios de refer&ecirc;ncia. Sketch + Revolve. Padr&atilde;o com lista de salto. Sliders com live-scrub. Cotas ao passar com o rato sobre arestas. Express&otilde;es em todos os campos num&eacute;ricos. Dez novas opera&ccedil;&otilde;es no v0.6 que nenhum modelador no browser tem.',
    'landing.feat.cta':       'Ver todas as funcionalidades &rarr;',

    'landing.shots.eyebrow':  'Screenshots reais',
    'landing.shots.h2':       'Este &eacute; o aspecto <span class="serif">verdadeiro.</span>',
    'landing.shots.p':        'Sem mockups, sem desenhos. A app real, geometria real, STLs realmente exportados.',

    'landing.workflow.eyebrow':'Fluxo de trabalho',
    'landing.workflow.h2':    'Da ideia ao STL pronto a imprimir<br><span class="serif">em quatro passos.</span>',
    'landing.workflow.p':     'Cinco minutos entre o primeiro lan&ccedil;amento e uma pe&ccedil;a impressa. Sem tutorial obrigat&oacute;rio, mas tens oitenta e cinco curtos em <a href="/tutorials" style="color: var(--lime); text-decoration: none;">/tutorials</a> se precisares.',
    'landing.workflow.s1.h':  'Larga uma forma',
    'landing.workflow.s1.p':  'Arrasta uma das <strong style="color:var(--text)">13 primitivas</strong> do painel da esquerda. <strong style="color:var(--text)">Live-scrub</strong> em qualquer slider em Propriedades para morfar a forma em tempo real. Escreve <code>2*12+4</code> em qualquer campo, ele avalia.',
    'landing.workflow.s2.h':  'Combinar com CSG',
    'landing.workflow.s2.p':  'Group (<kbd>Ctrl</kbd>+<kbd>G</kbd>), Hole (subtrair), Intersect (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>). Booleanos completos, revers&iacute;veis at&eacute; carregares <strong style="color:var(--text)">Bake</strong>.',
    'landing.workflow.s3.h':  'Push/Pull em qualquer face',
    'landing.workflow.s3.p':  'Clica numa face, mesmo uma rampa de 30&deg; de uma cunha, arrasta para fora. Um novo prisma cresce ao longo da normal dessa face. Adiciona chamfros, filetes, shells, padr&otilde;es com salto, tudo com poucos cliques.',
    'landing.workflow.s4.h':  'Exportar &middot; fatiar &middot; imprimir',
    'landing.workflow.s4.p':  'Carrega em <strong style="color:var(--text)">STL</strong>, <strong style="color:var(--text)">OBJ</strong> ou <strong style="color:var(--text)">STEP AP203</strong>. Abre no Bambu Studio, Cura, PrusaSlicer ou importa para o Fusion. Feito.',

    'landing.power.eyebrow':  'Ferramentas avan&ccedil;adas &middot; v0.6',
    'landing.power.h2':       'N&atilde;o s&oacute; cubos.<br><span class="serif">Movimentos de CAD sem ter de aprender menus.</span>',
    'landing.power.p':        'Seis funcionalidades que p&otilde;em o BlockBuilder &agrave; frente do Tinkercad. V&ecirc; cada uma em menos de 30 segundos em <a href="/tutorials" style="color: var(--lime); text-decoration: none;">/tutorials</a>.',
    'landing.power.c1.h':     'Push / Pull em qualquer face',
    'landing.power.c1.p':     'Clica numa face, mesmo a inclinada lateral de uma cunha ou pir&acirc;mide, arrasta para fora. Um novo prisma cresce ao longo da normal dessa face. A rampa de 30&deg; finalmente apanha o seu suporte num &uacute;nico gesto.',
    'landing.power.c2.h':     'Geometria de refer&ecirc;ncia',
    'landing.power.c2.p':     'Cria um <strong style="color:var(--text)">plano translucido por 3 pontos</strong>, um eixo ao longo de qualquer aresta, um marcador no ponto m&eacute;dio de qualquer aresta. Snap das pegas a estes elementos. Promove qualquer plano a workplane activo.',
    'landing.power.c3.h':     'Sketch + Revolve',
    'landing.power.c3.p':     'Clica pontos para desenhar um pol&iacute;gono, Enter, ele extrude. Ou cl&aacute;ssico <strong style="color:var(--text)">rabisco &agrave; m&atilde;o livre</strong>, o contorno fecha e extrude. Ou esbo&ccedil;a um perfil 2D e <strong style="color:var(--text)">revolve 360&deg;</strong> para vasos, garrafas, funis.',
    'landing.power.c4.h':     'Pattern v2 com Skip',
    'landing.power.c4.p':     'Arrays lineares ou circulares, depois escreve <code>3, 7, 9</code> no campo Skip e essas c&oacute;pias caem fora. Grelhas hexagonais com centro em falta, alvenarias com vazios, tudo num &uacute;nico passo em vez de duplicar e apagar.',
    'landing.power.c5.h':     'Cotas no hover de arestas',
    'landing.power.c5.p':     'Passa o cursor perto de qualquer aresta. Aparece um r&oacute;tulo com o comprimento exacto. Diagonais escondidas da triangula&ccedil;&atilde;o s&atilde;o filtradas, s&oacute; v&ecirc;s as arestas verdadeiras. Mais uma Ruler para dist&acirc;ncias entre dois pontos.',
    'landing.power.c6.h':     'Optimizado para toque',
    'landing.power.c6.p':     '<strong style="color:var(--text)">Rail flutuante</strong> em tablets (estilo Shapr3D), <strong style="color:var(--text)">dock inferior</strong> em telem&oacute;veis (estilo Womp), <strong style="color:var(--text)">menu radial em long-press</strong> para Duplicar / Esconder / Agrupar / Apagar. Pegas t&aacute;cteis 1.6&times; maiores para o dedo acertar.',
    'landing.power.note':     'Tamb&eacute;m novo no v0.6: <strong style="color:var(--text)">boolean Intersect</strong>, overlay de cotas, express&otilde;es em campos num&eacute;ricos (<code>2*12+4</code>, <code>sqrt(50)</code>), <strong style="color:var(--text)">Chamfer + Fillet em 10 primitivas</strong>, snap a vizinhos nas pegas, paleta de atalhos (<kbd>Ctrl</kbd>+<kbd>K</kbd>), exporta&ccedil;&atilde;o STEP AP203. <a href="/features" style="color: var(--lime);">L&ecirc; a lista completa &rarr;</a>',

    'landing.promises.eyebrow': 'O que recebes',
    'landing.promises.h2':    'Seis promessas. <span class="serif">Sem letra mi&uacute;da.</span>',
    'landing.promises.p':     'Mesmos compromissos para a vers&atilde;o gr&aacute;tis e para a licenciada. Mesmo software, mesmo c&oacute;digo, mesmo respeito.',
    'landing.promises.p1.h':  'Totalmente offline',
    'landing.promises.p1.p':  'A app nunca faz um pedido &agrave; rede depois de instalada. Avi&atilde;o, posto isolado, falha no Wi-Fi do caf&eacute;, mesmo comportamento.',
    'landing.promises.p2.h':  'Sem contas, nunca',
    'landing.promises.p2.p':  'Sem registo. Sem confirma&ccedil;&atilde;o de email. Sem "verifica a tua identidade". Instala e usa. As licen&ccedil;as comerciais verificam-se offline contra o ficheiro local.',
    'landing.promises.p3.h':  'Sem limites de upload',
    'landing.promises.p3.p':  'As importa&ccedil;&otilde;es acontecem localmente. Mete um STL de 500 MB com 5M tri&acirc;ngulos, s&oacute; a RAM &eacute; limite. Pick acelerado por BVH aguenta.',
    'landing.promises.p4.h':  'Os teus ficheiros s&atilde;o teus',
    'landing.promises.p4.p':  'Os saves s&atilde;o JSON simples no teu disco. As exporta&ccedil;&otilde;es STL caem em <code>Downloads/</code>. Nada sai da m&aacute;quina a menos que partilhes.',
    'landing.promises.p5.h':  'Sem rastreio',
    'landing.promises.p5.p':  'Zero telemetria. Zero analytics. Zero cookies. A app n&atilde;o sabe que existes depois de instalada. Este site tamb&eacute;m n&atilde;o.',
    'landing.promises.p6.h':  'Sem subscri&ccedil;&atilde;o',
    'landing.promises.p6.p':  'Uso pessoal &eacute; gr&aacute;tis para sempre. Licen&ccedil;a comercial s&atilde;o <strong style="color:var(--text)">&euro;12 uma vez</strong>, para a vida, todas as actualiza&ccedil;&otilde;es futuras inclu&iacute;das at&eacute; ao v1.0+.',

    'landing.uses.eyebrow':   'Casos de uso',
    'landing.uses.h2':        'Feito para o trabalho, <br><span class="serif">n&atilde;o para o workflow.</span>',
    'landing.uses.p':         'O que as pessoas realmente fazem com o BlockBuilder.',
    'landing.uses.tag.print': 'Impress&atilde;o 3D',
    'landing.uses.tag.proto': 'Prot&oacute;tipos',
    'landing.uses.tag.edu':   'Educa&ccedil;&atilde;o',
    'landing.uses.tag.maker': 'Makers',
    'landing.uses.tag.remix': 'Remixers',
    'landing.uses.tag.table': 'Jogos de mesa',
    'landing.uses.u1.h':      'Pe&ccedil;as de substitui&ccedil;&atilde;o',
    'landing.uses.u1.p':      'Suporte partido? Puxador desaparecido? Mede com paqu&iacute;metro, modela em 5 minutos, imprime em 30.',
    'landing.uses.u2.h':      'Da ideia ao mock numa tarde',
    'landing.uses.u2.p':      'Mais r&aacute;pido que o Fusion para designs em bloco. Passa a param&eacute;trico s&oacute; quando as propor&ccedil;&otilde;es estiverem boas.',
    'landing.uses.u3.h':      '3D na sala de aula sem logins',
    'landing.uses.u3.p':      'Sem contas de aluno para criar, sem formul&aacute;rios da escola. Cada PC corre a sua inst&acirc;ncia.',
    'landing.uses.u4.h':      'Gabaritos, suportes, organizadores',
    'landing.uses.u4.p':      'Caixas, suportes de ferramentas, divisores de gaveta, suportes para GoPro. O lado pr&aacute;tico chato em que a impress&atilde;o 3D &eacute; melhor.',
    'landing.uses.u5.h':      'Editar STLs importados',
    'landing.uses.u5.p':      'Puxa um modelo do Printables, escala, corta uma sec&ccedil;&atilde;o, abre um buraco, re-exporta. Sem limite de 25 MB no upload.',
    'landing.uses.u6.h':      'Bases &middot; cen&aacute;rios &middot; props',
    'landing.uses.u6.p':      'Bases hexagonais, muros em ru&iacute;nas, miniaturas simples. Estrela + pol&iacute;gono + extrude levam-te a 80%.',

    'landing.devices.eyebrow':'Uma app, todos os ecr&atilde;s',
    'landing.devices.h2':     'Na tua secret&aacute;ria.<br><span class="serif">No teu iPad.</span><br>No autocarro no telem&oacute;vel.',
    'landing.devices.p':      'Mesmo projecto, mesmas ferramentas, mesmo STL na sa&iacute;da. Sem conta, sem sync na cloud, sem compromissos por dispositivo.',
    'landing.devices.cap.dt': 'Desktop &middot; Windows / macOS / Linux',
    'landing.devices.cap.tb': 'iPad e tablets Android &middot; rail UI',
    'landing.devices.cap.ph': 'iPhone e Android &middot; dock UI',
    'landing.devices.cta':    'Abrir no browser, em qualquer dispositivo &rarr;',
    'landing.devices.note':   'Funciona offline depois da primeira visita. Adicionar &agrave; Home Screen para teres &iacute;cone de app.',

    'landing.final.h2':       'Pronto para <span class="accent serif">modelar?</span>',
  },
};

function getLang() {
  const stored = localStorage.getItem('bb.lang');
  if (stored === 'en' || stored === 'pt') return stored;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return browser === 'pt' ? 'pt' : 'en';
}

function applyLang(lang) {
  const dict = DICT[lang] || DICT.en;
  document.documentElement.lang = lang === 'pt' ? 'pt' : 'en';
  // Swap every translatable element
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const txt = dict[key];
    if (txt !== undefined) el.innerHTML = txt;
  });
  // Title is tagged with data-i18n-title="key" on <title>
  const titleEl = document.querySelector('title[data-i18n-title]');
  if (titleEl) {
    const key = titleEl.dataset.i18nTitle;
    if (dict[key]) document.title = dict[key].replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&ccedil;/g, 'ç').replace(/&atilde;/g, 'ã').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ecirc;/g, 'ê').replace(/&otilde;/g, 'õ');
  }
  // Sync the toggle chips
  document.querySelectorAll('.lang-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.lang === lang);
    chip.setAttribute('aria-pressed', chip.dataset.lang === lang ? 'true' : 'false');
  });
  // Sync the privacy page's data-lang attr if we're on /privacy
  if (document.querySelector('.lang-pt, .lang-en')) {
    document.documentElement.setAttribute('data-lang', lang);
  }
  localStorage.setItem('bb.lang', lang);
}

function bindToggle() {
  document.querySelectorAll('.lang-chip').forEach((chip) => {
    chip.addEventListener('click', (ev) => {
      ev.preventDefault();
      applyLang(chip.dataset.lang);
    });
  });
}

// Run as early as possible so PT visitors don't flash EN content. Without
// DOMContentLoaded we still need the DOM, so we let the parser get past the
// nav + body before swapping. Inline this script before </body>.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { applyLang(getLang()); bindToggle(); });
} else {
  applyLang(getLang());
  bindToggle();
}
