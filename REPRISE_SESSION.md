# REPRISE DE SESSION

CWD_SESSION : C:\Users\charl\Documents\CONFIGURATEUR DE BIJIOUX

## Projet
Configurateur de bijoux Rosebuds : application Windows et site autonome.

## Objectif global
Terminer, verifier, reinstaller et publier les demandes du catalogue et du viewer.

## Branche Git
master, origin https://github.com/rsbds-3d/configurateur.git. Modifications locales preservees.

## Version actuelle
v0.5-260914, VERSION = 0.5, cache 20260914-png-preview-v05. Publication v0.5 en cours le 15 septembre ; v0.4 reste la derniere publication confirmee tant que les controles distants ne sont pas effectues.

## Travail termine
- Catalogue blanc/noir/fuchsia : modes guide, multifiltre et prompt IA, tailles plug et cristal separees, famille Originale et restrictions metier.
- Decalcomanie prioritaire sur le maillage, geste long/glisser et persistance par modele.
- BVH en worker annulable, rendu PBR provisoire, compilation GPU asynchrone differee pendant la manipulation.
- Bibliotheque de visibilite des materiaux construite sur demande.
- Objets comparatifs, regle graduee, capture PNG/partage, rendu optimise et super-resolution locale.
- Resume produit et liens commerciaux, logo ROSEBUDS sur les deux ecrans.
- EXE et installateur Inno Setup v0.4 generes.
- 12 septembre : encodage UTF-8 de la construction web corrige, 27 tests passes, accents du HTML genere verifies.

## Travail en cours
15 septembre : apercu PNG persistant ajoute, ouverture/enregistrement explicites, nettoyage des URL, prevention des doubles clics. 28 tests reussis. Capture reelle 1600 x 900 non vide verifiee dans Codex, affichage mobile 390 x 844 lisible. Telechargement sur disque et partage natif non confirmes.
Paquet web et installateur v0.5 compiles. Desinstallation v0.4 retourne encore 1 ; mise a jour sur place v0.5 reussie (code 0). EXE source/installe SHA256 4B1139786147CD5C7E7EF4F50D2F1C44D84CE409701DB5342DDF75725CD7D605. Serveur installe HTTP 200, en-tete et interface v0.5 verifies. Installateur SHA256 13A9DD9E7BF4FD90BBA40BE595C8DDF609290355BFBC85FDF841B38CAF7E9FB3.

Historique v0.4 :
Mise a niveau Windows v0.4 reussie le 12 septembre, code Inno 0. Desinstallation prealable refusee (code 1, sans journal) : installation sur place, pas de desinstallation complete. EXE installe identique au livrable, HTTP 200, en-tete et interface v0.4 verifies.
Sources publiees : be8c390b02172175fd5bb68f390737eb3ae9385c. GitHub Pages run 34710847482 reussi. Site public et connexion verifies le 13 septembre : https://rsbds-3d.github.io/configurateur/.
Release : https://github.com/rsbds-3d/configurateur/releases/tag/v0.4-260911 ; installateur 22441193 octets, SHA256 B408990632EDB39F8BAAFDC517DF60DF96467D1B83AD1AD167DCF92DDC976534, digest distant identique.

## Decisions et problemes connus
- Conserver le shader BVH des pierres ; grand solide metallique, petit solide gemme.
- IA en workers, poids telecharges au premier usage puis caches, pas physiquement livres dans le depot.
- Rendu optimise : PBR et Swin2SR, pas encore de rendu generatif ComfyUI complet.
- GitHub Pages : identification cote navigateur uniquement, pas de confidentialite serveur des ressources publiques.
- Ne pas garantir une absence totale de latence GPU sur tous les appareils.

## Fichiers importants
app.js, welcome.js, index.html, style.css, welcome.css ; assets/js/diamond/background-bvh.js et bvh-worker.js ; assets/js/decal-gesture.js ; catalog-ai-worker.js ; render-enhance-worker.js ; online/build-online.ps1 ; launcher/Program.cs.

## Commandes importantes
Tests : node sur chaque tests/*.test.cjs.
Web : powershell -NoProfile -ExecutionPolicy Bypass -File online/build-online.ps1.
Lanceur : launcher/build-launcher.ps1.
Inno : C:\Program Files (x86)\Inno Setup 6\ISCC.exe.

## Tests realises
28 tests Node reussis le 15 septembre. Controles navigateur precedents : catalogue, multifiltre NEW SMALL noir, prompt, Originale XXXL90 avec progression et rendu optique, regle visible. Capture PNG et affichage mobile verifies pour v0.5.

## Tests restant a faire
Validation prolongee mobile et AR camera reelle ; partage natif PNG ; resultat complet de super-resolution IA ; geste decalcomanie dans navigateur en complement des tests unitaires.
13 septembre : export PNG clique dans le navigateur integre, evenement download non recu en 20 secondes, aucun fichier confirme. Ne pas presenter ce controle comme reussi ; distinguer limitation du navigateur et bug applicatif.
Catalogue public : multifiltre NEW SMALL aluminium propose uniquement noir, cristal/verre presse, deux modeles. Viewer charge visuellement avec corps noir et petite pierre claire, puis retour au catalogue. Onglet conserve comme apercu.

## Prochaines actions prioritaires
1. Completer les controles reels du viewer et de l'IA mentionnes ci-dessus, notamment PNG dans Chrome et glisser-deposer du logo.
2. Finaliser le moteur generatif hyperrealiste demande, sans confondre super-resolution et generation.
3. Clarifier la protection serveur si une confidentialite forte est attendue pour le site.

## Interdictions / points de vigilance
Aucun reset, nouveau worktree ou changement de branche. Ne pas publier de mot de passe en clair. Auth gh fonctionne hors sandbox (diagnostic sandbox faux negatif reseau). Ne pas annoncer ComfyUI ou une authentification serveur comme termines.

## Derniere demande utilisateur
CONTINUE ; nouvelles regles AGENTS globales remplacant les anciennes. Meme cwd et branche.
