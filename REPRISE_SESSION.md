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
`v0.8-260929`, VERSION = `0.8`, cache `20260929-ruler-reference-v08`.

## Etat actuel
Version v0.8 compilee, testee et reinstallee localement. Publication GitHub Pages et release v0.8 a terminer dans cette session.

## Travail termine
- Remplacement de la regle procedurale par le fichier original `Regle_20cm_ROSEBUDS.glb` fourni.
- Conservation des quatre objets, trois materiaux et deux textures PNG embarquees du GLB.
- Chargement differe, clonage isole, conversion metres glTF vers millimetres du viewer, centrage et pose au sol.
- Dimensions physiques verifiees : 210 x 32 x 5 mm pour 200 mm gradues.
- Version visible `v0.8-260929` et version PE `0.8.0.0`.
- 34 tests Node reussis et controle visuel local dans le viewer.
- EXE et installateur v0.8 compiles ; v0.7 desinstallee, v0.8 installee, serveur local HTTP 200 et regle installee verifies.

## Travail en cours
- Publier les sources et le site v0.8 sur GitHub.
- Creer la release `v0.8-260929` avec l'installateur et verifier le deploiement distant.

## Decisions prises
- Utiliser exclusivement la regle GLB originale fournie, jamais une geometrie procedurale simplifiee.
- Conserver la longueur exterieure reelle de 210 mm ; la graduation utile mesure 200 mm.
- Les objets d'echelle sont charges uniquement a la demande et conservent leur propre materiau.
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
- Regle GLB controlee visuellement dans le viewer local, avec graduations et marquage visibles.
- EXE : SHA-256 `F480645E998157D05871229EE1C54B79A96A750C212F7B40EBCEDB15F0ED0443`.
- Installateur : SHA-256 `4F6F32D56D8B4654729A7A9C70415D6325AFF67A32FC0026DAB5E8EF38BA3822`.
- Regle GLB source, paquet web et installation : SHA-256 `F73035E5EFEB812DDFB4B4EFBCB737757589A4A2A4A46082414C1F084654FC70`.
- Installation locale : codes 0, HTTP 200, en-tete `v0.8-260929`, VERSION `0.8`.

## Tests restant a faire
- Verifier le workflow GitHub Actions et le site public v0.8 apres publication.
- Verifier le digest de l'installateur dans la release.
- Telephone reel : geste tactile, AR camera et partage natif PNG.

## Prochaines actions prioritaires
1. Examiner le diff, commiter et pousser la v0.8 sur `master`.
2. Attendre le succes du deploiement GitHub Pages et verifier le GLB public.
3. Creer la release `v0.8-260929` avec l'installateur puis verifier son digest.
4. Completer ce fichier et le journal avec les identifiants de publication.

## Interdictions / points de vigilance
Aucun reset destructif, nouveau worktree ou changement de branche. Ne pas annoncer ComfyUI, une authentification serveur forte ou les tests mobiles comme termines.

## Derniere demande utilisateur
Remplacer la regle simpliste de l'objet d'echelle par le fichier `Regle_20cm_ROSEBUDS.glb` fourni, puis continuer jusqu'a la livraison complete.
