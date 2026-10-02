# REPRISE DE SESSION

## Mise a jour prioritaire du 2 octobre 2026
Version preparee v0.11-260930 (VERSION 0.11). Les sections historiques ci-dessous decrivent la derniere livraison v0.10, pas l'etat de livraison actuel.
Code : Keyring partage sur 14 corps avec tete ; finitions Gold/Silver/Shiny/Patine ; ordre actif des questions conserve Gold apres taille et metal ; normales lissees, anisotropie sans tangentes desactivee et OutputPass ; reflets MEDIUM inox et Keyring Shiny verifies visuellement ; logo blanc alu et marron dore inox ; BVH worker/IndexedDB et annulation catalogue ; erreurs de transaction cache resolues ; login autonome ; icone Rosebuds et Chrome --app.
37 tests passes, regression supplementaire lien bronze passee. Web regenere. Inno final compile ; v0.10 desinstallee et v0.11 installee, VERSION/empreintes conformes et HTTP 200. Publication v0.11 encore a verifier.
Priorites : relancer tests ; regenerer Inno ; reinstaller uniquement Rosebuds ; verifier HTTP/version/empreintes ; relire diff et publier master/Pages/release avec autorisation existante ; mettre a jour journal avec preuves.
Fichiers recents : app.js, welcome.js, assets/js/diamond/background-bvh.js, assets/js/rosebuds-product-link.js, online/login.html, online/app-guard.js, scripts/build-bronze-models.py.
Limites : cache BVH ne sauvegarde pas les programmes GPU ; AR physique non teste ; ComfyUI generatif non termine ; IA telechargee/cachee non totalement embarquee ; authentification Pages cote client ne protege pas les ressources publiques.
Historique utile : Sauvegardes sessions/2026-10-02-01-continuation.md. Derniere demande : CONTINUE.

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
`v0.10-260929`, VERSION = `0.10`, cache interface `20260929-optimized-3dm-decal-v10`, cache geometrie `20260929-optimized-3dm-v10`.

## Etat actuel
La v0.10 est integree, testee, reinstallee et publiee. Les 37 nouveaux modeles 3DM et la course complete du logo sont disponibles localement et sur GitHub Pages.

## Travail termine
- Association explicite des 37 sources aux 37 identifiants et cibles du catalogue.
- Remplacement de 21 Originale, 14 NEW MEDIUM et 2 NEW SMALL sans utiliser les anciens fichiers archives.
- Audit `rhino3dm` : structure BREP stable, sommets de rendu 276 518 -> 761 465, faces 267 777 -> 752 931.
- Manifeste source/cible, registre SHA-256 et script PowerShell idempotent compatible avec les chemins UTF-8.
- Cache-buster applique aux chargements principaux et comparatifs.
- Course du logo etendue au profil axial complet du solide, interpolation du rayon local et persistance par modele conservee.
- Controle visuel local des familles Originale, NEW MEDIUM et NEW SMALL ; logo visible a l'extremite sur le XL Plus sans tete.
- 35 tests Node reussis.
- Paquet web autonome, lanceur PE 0.10.0.0 et installateur v0.10 generes.
- v0.9 desinstallee puis v0.10 installee : HTTP 200, version visible, en-tete v0.10 et 37 empreintes installees conformes.
- Commit `937f301` pousse sur master ; workflow GitHub Pages `36589354021` reussi.
- Site public v0.10 controle : HTML courant et trois modeles representatifs strictement conformes.
- Release `v0.10-260929` publiee avec installateur de 25 457 401 octets et digest conforme.

## Travail en cours
Aucun travail requis pour la livraison v0.10. Les essais physiques sur telephone restent un controle materiel ulterieur.

## Decisions prises
- Conserver la topologie fonctionnelle des fichiers Rhino et utiliser leurs nouveaux maillages de rendu plus denses sans subdivision Three.js supplementaire par defaut.
- La position initiale du logo reste au centre de la tige ; sa course utilise toute la longueur mesuree du solide avec un retrait de bord maximal de 0,5 %.
- Le rayon de projection de la decalcomanie suit le profil local du plug.
- Le fichier `model-integrity.json` est la reference des binaires livres.

## Fichiers importants
`app.js`, `assets/js/decal-placement.js`, `assets/models/plugs/model-source-manifest.json`, `assets/models/plugs/model-integrity.json`, `scripts/update-plug-models.ps1`, `scripts/audit_3dm_meshes.py`, `tests/plug-model-integrity.test.cjs`, `tests/decal-position.test.cjs`, `Documentation/Audit integration modeles 3DM v0.10-260929.md`.

## Commandes importantes
- Audit/copie : `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update-plug-models.ps1 -Mode Audit` ou `-Mode Apply`.
- Audit maillage : `python scripts/audit_3dm_meshes.py`.
- Tests : executer chaque `tests/*.test.cjs` avec Node et controler `$LASTEXITCODE`.
- Web : `powershell -NoProfile -ExecutionPolicy Bypass -File online/build-online.ps1`.
- Lanceur : `powershell -NoProfile -ExecutionPolicy Bypass -File launcher/build-launcher.ps1`.
- Inno : `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`.

## Problemes connus
- La compilation GPU initiale peut rester longue selon la machine, mais le rendu provisoire reste visible.
- Les poids du LLM et de Swin2SR sont telecharges puis mis en cache, pas physiquement inclus.
- Le rendu generatif ComfyUI complet n'est pas implemente.
- L'authentification GitHub Pages cote navigateur ne rend pas les ressources publiques confidentielles.

## Tests realises
- 35 tests Node reussis le 29 septembre 2026.
- Controle SHA-256 : 0 ecart source/cible, 0 ecart dans `online/dist`, 0 ecart dans l'installation locale.
- Controle visuel local : Originale XL, NEW MEDIUM 35 cristal, NEW SMALL cristal et Originale XL Plus sans tete.
- Glissement : une ancienne position minimale memorisee atteint maintenant l'extremite du XL Plus sans tete.
- Lanceur SHA-256 : `B638F6D49EDB5E6386F9289DEAD4C3DB99D21A2F3E2700E0C56843F303155887`.
- Installateur SHA-256 : `C7A7BF464F4B1A61C43453E97BA4352FAAF9554B308100E354E1CC804CFE0451`.
- Installation locale : PE 0.10.0.0, VERSION 0.10, HTTP 200, en-tete v0.10 et 37 modeles conformes.
- GitHub Pages : workflow `36589354021` reussi ; Originale XL Plus sans tete, NEW MEDIUM 35 cristal et NEW SMALL cristal verifies par SHA-256 depuis le site public.
- Release : `https://github.com/rsbds-3d/configurateur/releases/tag/v0.10-260929`, digest distant conforme.

## Tests restant a faire
- Telephone reel : geste tactile, AR camera et partage natif PNG.

## Prochaines actions prioritaires
1. Tester sur un telephone reel les gestes tactiles, l'AR camera et le partage PNG.
2. Profiler la charge GPU des maillages 3DM plus denses sur appareils modestes.
3. Recueillir le retour utilisateur sur les silhouettes et reflets des nouveaux maillages.

## Interdictions / points de vigilance
Aucun reset destructif, nouveau worktree ou changement de branche. Ne pas melanger les fichiers portant des noms proches. Ne pas annoncer les tests mobiles comme termines.

## Derniere demande utilisateur
Continuer l'integration des nouveaux 3DM et supprimer la butee invisible qui empechait de faire glisser le logo jusqu'au bout de la surface.
