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
`v0.9-260929`, VERSION = `0.9`, cache `20260929-scale-orientation-v09`.

## Etat actuel
Version v0.9 compilee, testee et reinstallee localement. La publication GitHub Pages et la release Windows restent a verifier.

## Travail termine
- Remplacement de la regle procedurale par le fichier original `Regle_20cm_ROSEBUDS.glb` fourni.
- Conservation des quatre objets, trois materiaux et deux textures PNG embarquees du GLB.
- Chargement differe, clonage isole, conversion metres glTF vers millimetres du viewer, centrage et pose au sol.
- Dimensions physiques verifiees : 210 x 32 x 5 mm pour 200 mm gradues.
- Version visible `v0.8-260929` et version PE `0.8.0.0`.
- 34 tests Node reussis et controle visuel local dans le viewer.
- EXE et installateur v0.8 compiles ; v0.7 desinstallee, v0.8 installee, serveur local HTTP 200 et regle installee verifies.
- Commit source `6994dfb` pousse sur `master` ; workflow GitHub Pages `36525144113` termine avec succes.
- Site public v0.8 controle : HTTP 200, version visible correcte et GLB public strictement identique a la source.
- Release `v0.8-260929` publiee avec l'installateur et digest distant verifie.
- Bouteille 1 L definie comme objet d'echelle par defaut et regle placee parallelement au plug.
- Sens vertical corrige : tete/pierre en bas, ogive en haut, plugs poses sur le sol.
- Comparaison en arc activee par defaut, rayon reglable de 250 a 2 000 mm, ligne droite disponible.
- Plug courant centre comme pivot de l'orbite et distingue par un halo fuchsia ; panoramique verrouille pendant la comparaison.
- Controle visuel local du tri, de l'arc, de l'orientation, du centrage et du halo.
- 34 tests reussis ; paquet web, lanceur et installateur v0.9 compiles.
- v0.8 desinstallee puis v0.9 installee : EXE 0.9.0.0, VERSION 0.9, HTTP 200 et en-tete v0.9 verifies.

## Travail en cours
Publier la v0.9 sur GitHub Pages et creer la release Windows. Les essais physiques sur telephone restent un controle materiel ulterieur.

## Decisions prises
- Utiliser exclusivement la regle GLB originale fournie, jamais une geometrie procedurale simplifiee.
- Conserver la longueur exterieure reelle de 210 mm ; la graduation utile mesure 200 mm.
- Les objets d'echelle sont charges uniquement a la demande et conservent leur propre materiau.
- La bouteille est le choix par defaut ; la regle suit l'axe principal horizontal du plug.
- En comparaison, la tete et la pierre restent en bas, l'ogive en haut ; l'arc de 600 mm est active par defaut.
- La camera pivote autour du plug courant, qui reste centre et signale par un halo.
- Le viewer necessite HTTP/HTTPS ; `file:///` sert uniquement de point de reprise vers l'application locale.

## Fichiers importants
`app.js`, `index.html`, `assets/js/ruler-reference.js`, `assets/models/references/Regle_20cm_ROSEBUDS.glb`, `tests/ruler-reference.test.cjs`, `tests/viewer-tools.test.cjs`, `online/build-online.ps1`, `launcher/Program.cs`.

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
- 34 tests Node reussis le 29 septembre 2026.
- Controle visuel local du comparatif en arc : orientation, sol, centrage et halo conformes.
- Lanceur v0.9 : SHA-256 `21A1AB700D89C18BFE7210F45CED003C52D03C6819F7935E507A8113B0CD3413`.
- Installateur v0.9 : SHA-256 `043AA5F52FE56D5278B8B09F8923AB16E31F70CD38800FE99D8FEAAA11CA0E37`.
- Installation locale v0.9 : codes 0, EXE 0.9.0.0, VERSION 0.9, HTTP 200, en-tete v0.9.
- Regle GLB controlee visuellement dans le viewer local, avec graduations et marquage visibles.
- EXE : SHA-256 `F480645E998157D05871229EE1C54B79A96A750C212F7B40EBCEDB15F0ED0443`.
- Installateur : SHA-256 `4F6F32D56D8B4654729A7A9C70415D6325AFF67A32FC0026DAB5E8EF38BA3822`.
- Regle GLB source, paquet web et installation : SHA-256 `F73035E5EFEB812DDFB4B4EFBCB737757589A4A2A4A46082414C1F084654FC70`.
- Installation locale : codes 0, HTTP 200, en-tete `v0.8-260929`, VERSION `0.8`.
- GitHub Pages : workflow `36525144113` reussi pour le commit `6994dfb`.
- Site public : HTTP 200, interface `v0.8-260929`, GLB 87 900 octets et empreinte conforme.
- Release : `https://github.com/rsbds-3d/configurateur/releases/tag/v0.8-260929`, digest distant conforme a l'installateur local.

## Tests restant a faire
- Telephone reel : geste tactile, AR camera et partage natif PNG.

## Prochaines actions prioritaires
1. Executer les 34 tests, compiler le web, le lanceur et l'installateur v0.9.
2. Reinstaller localement puis publier GitHub Pages et la release v0.9.
3. Tester sur un telephone reel les gestes tactiles, l'AR camera et le partage PNG.

## Interdictions / points de vigilance
Aucun reset destructif, nouveau worktree ou changement de branche. Ne pas annoncer ComfyUI, une authentification serveur forte ou les tests mobiles comme termines.

## Derniere demande utilisateur
Dans le comparatif, mettre le plug courant en surbrillance, centrer la camera et l'orbite sur lui, puis proposer par defaut une disposition en arc avec rayon reglable.
