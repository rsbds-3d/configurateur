# REPRISE DE SESSION

NOM_SESSION_CIBLE : à calculer uniquement lors de la prochaine bascule de session
CWD_SESSION : C:\Users\charl\Documents\CONFIGURATEUR DE BIJIOUX

## Projet
Configurateur de bijoux Rosebuds : application Windows et site web autonome.

## Objectif global
Maintenir le catalogue métier et le viewer Three.js, vérifier l'application Windows et publier la même version sur GitHub Pages.

## Répertoire de travail
Sources et CWD identiques : `C:\Users\charl\Documents\CONFIGURATEUR DE BIJIOUX`.

## Branche Git
`master`, origin `https://github.com/rsbds-3d/configurateur.git`. Aucun worktree.

## Version actuelle
`v0.6-260923`, VERSION = `0.6`, cache `20260923-catalog-logo-v06`.

## État actuel
Version v0.6 compilée et installée localement. Publication GitHub restant à effectuer au moment de cette mise à jour.

## Travail terminé
- Catalogue : noms commerciaux anglais, XL 27/35 mm, NEW 12 mm, XL Plus et règles gemme/verre pressé.
- Résultats déclinés par combinaison exacte de matériaux.
- Décalcomanie prioritaire sur le maillage, glissement souris immédiat, appui long tactile et persistance par modèle.
- Exports PNG avec filigranes ROSEBUDS diagonaux répétés.
- Objet d'échelle `Bouteille_1L_cristal.glb`, hauteur 258,23 mm et chargement différé.
- Ouverture `file:///` : reprise automatique sur HTTP ou aide si le serveur est arrêté.
- Viewer XL vérifié visuellement : rendu provisoire visible et progression du lancer de rayons.
- 32 tests Node réussis.
- EXE et installateur v0.6 compilés ; installation locale code 0 ; HTTP 200 et version installée vérifiés.

## Travail en cours
- Commit, push GitHub, contrôle GitHub Pages et release v0.6.

## Décisions prises
- Le viewer nécessite HTTP/HTTPS ; `file:///` sert uniquement de point de reprise vers l'application locale.
- Conserver le shader BVH et un rendu PBR provisoire manipulable pendant les calculs.
- Les captures des cartes montrent la géométrie ; libellés et pastilles distinguent les matériaux appliqués.
- Utiliser uniquement la bouteille originale fournie, jamais la variante `visionneuse3D`.

## Fichiers importants
`welcome.js`, `app.js`, `index.html`, `assets/js/decal-gesture.js`, `assets/js/png-watermark.js`, `assets/js/bottle-reference.js`, `assets/models/references/Bouteille_1L_cristal.glb`, `online/build-online.ps1`, `launcher/Program.cs`.

## Commandes importantes
- Tests : exécuter chaque `tests/*.test.cjs` avec Node.
- Web : `powershell -NoProfile -ExecutionPolicy Bypass -File online/build-online.ps1`.
- Lanceur : `powershell -NoProfile -ExecutionPolicy Bypass -File launcher/build-launcher.ps1`.
- Inno : `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`.

## Problèmes connus
- La compilation GPU initiale peut rester longue selon la machine, mais le rendu provisoire reste visible.
- Les poids du LLM et de Swin2SR sont téléchargés puis mis en cache, pas physiquement inclus.
- Le rendu génératif ComfyUI complet n'est pas implémenté.
- L'authentification GitHub Pages côté navigateur ne rend pas les ressources publiques confidentielles.

## Tests réalisés
- 32 tests réussis le 23 septembre 2026.
- Viewer XL local et installé contrôlé visuellement sans écran noir.
- EXE source/installé : SHA-256 `9277490B767F5E90F0151E3D2DD51437482057A162C414BEB01690941DDC9EE1`.
- Installateur : SHA-256 `0C02571FD6448195B76F0B1FA8E335B51868B53B5160B7B2A6B71C99440BB1F0`.

## Tests restant à faire
- Téléphone réel : geste tactile, AR caméra et partage natif PNG.
- Mesures de performance sur plusieurs GPU et téléphones.

## Prochaines actions prioritaires
1. Commit et push de v0.6.
2. Vérifier GitHub Pages et la version publique.
3. Créer la release v0.6 avec l'installateur.

## Interdictions / points de vigilance
Aucun reset destructif, nouveau worktree ou changement de branche. Ne pas annoncer ComfyUI, une authentification serveur forte ou les tests mobiles comme terminés.

## Dernière demande utilisateur
Corriger l'écran noir du viewer 3D puis continuer la finalisation.
