# REPRISE DE SESSION

NOM_SESSION_CIBLE : a calculer uniquement lors de la prochaine bascule de session
CWD_SESSION : C:\Users\charl\Documents\CONFIGURATEUR DE BIJIOUX

## Projet
Configurateur de bijoux Rosebuds : application Windows et site web autonome.

## Objectif global
Maintenir le catalogue metier et le viewer Three.js, verifier l'application Windows et publier la meme version sur GitHub Pages.

## Repertoire de travail
Sources et CWD identiques : `C:\Users\charl\Documents\CONFIGURATEUR DE BIJIOUX`.

## Branche Git
`master`, origin `https://github.com/rsbds-3d/configurateur.git`. Aucun worktree.

## Version actuelle
`v0.7-260928`, VERSION = `0.7`, cache `20260928-scale-comparison-v07`.

## Etat actuel
Version v0.7 compilee, testee, reinstallee localement et publiee sur GitHub Pages avec une release contenant son installateur.

## Travail termine
- Remplacement de l'objet d'echelle simplifie par le fichier exact `Piece_1_euro.glb`, texture et trois materiaux embarques conserves.
- Dimensions physiques de la piece respectees : 23,25 mm de diametre et 2,33 mm d'epaisseur.
- Ajout du mode `Comparer les tailles de plugs` dans la liste des objets d'echelle.
- Comparaison limitee aux modeles compatibles avec la gamme, la tete, le metal, la finition et l'ornement courants ; seule la taille varie.
- Tri de gauche a droite du plus petit au plus grand, taille courante entre les tailles inferieures et superieures, jeu physique de 20 mm.
- Position verticale activee par defaut, ornement vers le haut et plugs poses au sol ; option desactivable.
- Cadrage dedie de la rangee comparative et conservation d'une echelle physique commune entre modeles Rhino.
- Version visible `v0.7-260928` dans les interfaces web et version PE `0.7.0.0` dans le lanceur Windows.
- 33 tests Node reussis.
- EXE et installateur v0.7 compiles ; v0.6 desinstallee, v0.7 installee, serveur local HTTP 200 et version installee verifies.
- Sources poussees dans le commit `5cff576`, deploiement GitHub Pages `36482122738` reussi et release `v0.7-260928` publiee.

## Travail en cours
- Aucun travail de livraison v0.7 restant.

## Decisions prises
- Utiliser exclusivement le GLB de piece fourni, jamais un substitut procedural ou une variante de visionneuse.
- Reutiliser les memes reglages de materiaux et d'ornement pour les plugs compares, en ne variant que la taille.
- Corriger la normalisation propre a chaque fichier Rhino afin de conserver les rapports d'echelle physiques entre plugs.
- Le viewer necessite HTTP/HTTPS ; `file:///` sert uniquement de point de reprise vers l'application locale.
- Conserver le shader BVH et un rendu PBR provisoire manipulable pendant les calculs.

## Fichiers importants
`app.js`, `index.html`, `assets/js/coin-reference.js`, `assets/models/references/Piece_1_euro.glb`, `tests/coin-reference.test.cjs`, `tests/viewer-tools.test.cjs`, `online/build-online.ps1`, `launcher/Program.cs`.

## Commandes importantes
- Tests : executer chaque `tests/*.test.cjs` avec Node et controler `$LASTEXITCODE` apres chaque fichier.
- Web : `powershell -NoProfile -ExecutionPolicy Bypass -File online/build-online.ps1`.
- Lanceur : `powershell -NoProfile -ExecutionPolicy Bypass -File launcher/build-launcher.ps1`.
- Inno : `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`.

## Problemes connus
- La compilation GPU initiale peut rester longue selon la machine, mais le rendu provisoire reste visible.
- Une erreur shader ancienne liee a la decalcomanie et a `transmissionAlpha` peut encore apparaitre dans la console sans bloquer le rendu.
- Les poids du LLM et de Swin2SR sont telecharges puis mis en cache, pas physiquement inclus.
- Le rendu generatif ComfyUI complet n'est pas implemente.
- L'authentification GitHub Pages cote navigateur ne rend pas les ressources publiques confidentielles.

## Tests realises
- 33 tests Node reussis le 28 septembre 2026.
- Piece GLB et rangee comparative controlees visuellement dans le viewer local.
- EXE : SHA-256 `BAAD9CCCF453A290E258ECD2CED407659F8F3DD8C15B561FC2DD4B2D22D231FD`.
- Installateur : SHA-256 `6600E8644EE37BA528C3A29E0ACEE1E16FACDC951FAFB33A67110840FD5B2F94`.
- Piece GLB source, paquet web et installation : SHA-256 `2A84249F3D7C504B6B694AE28FC8F475294E67E831EF66E44769F2F00219A6B7`.
- Installation locale : code 0, HTTP 200, en-tete `v0.7-260928`, VERSION `0.7`, controles `Comparer` et `Plugs verticaux` presents.
- GitHub Pages : run `36482122738` reussi, site public HTTP 200 et ressources v0.7 verifiees.
- Release : `https://github.com/rsbds-3d/configurateur/releases/tag/v0.7-260928`, digest distant de l'installateur identique.

## Tests restant a faire
- Telephone reel : geste tactile, AR camera et partage natif PNG.
- Mesures de performance sur plusieurs GPU et telephones.

## Prochaines actions prioritaires
1. Recueillir les retours d'usage sur la comparaison des tailles et les objets d'echelle.
2. Tester sur telephone reel le tactile, l'AR et le partage natif PNG.
3. Mesurer les performances sur plusieurs GPU et telephones.

## Interdictions / points de vigilance
Aucun reset destructif, nouveau worktree ou changement de branche. Ne pas annoncer ComfyUI, une authentification serveur forte ou les tests mobiles comme termines.

## Derniere demande utilisateur
Ajouter la comparaison des plugs par taille avec orientation verticale et 20 mm de jeu, puis continuer jusqu'a la livraison complete.
