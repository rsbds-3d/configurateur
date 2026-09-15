# Planning et suivi

Version : **v0.5-260914**

| Date | Travail | État | Durée |
|---|---|---|---|
| 2026-08-22 | Restauration du shader optique BVH sur toutes les pierres transparentes compatibles | Terminé et testé | Non mesurée |
| 2026-08-22 | Prévention du gel du fallback CPU pour les cabochons et matériaux à faible IOR | Terminé et testé | Non mesurée |
| 2026-08-22 | Séparation entre taille physique et famille NEW SMALL/NEW MEDIUM | Terminé et testé | Non mesurée |
| 2026-08-22 | Vérification visuelle du catalogue et du viewer NEW MEDIUM 35 | Terminé | Non mesurée |
| 2026-08-22 | Ajout du choix initial Classique / NEW MEDIUM / NEW SMALL avec profils 2D | Terminé et testé | Non mesurée |
| 2026-08-22 | Ajout conditionnel du choix Classique avec tête / sans tête et filtrage du catalogue | Terminé et testé | Non mesurée |
| 2026-08-22 | Version visible, documentation et tests de non-régression | Terminé | Non mesurée |
| 2026-08-26 | Matrice de compatibilité aluminium/inox par classe et exception NEW SMALL | Terminé et testé | Non mesurée |
| 2026-08-26 | Restriction cristal, gemme et verre pressé selon la famille et le métal | Terminé et testé | Non mesurée |
| 2026-09-01 | Règle métal Classique : aluminium et inox jusqu'au XL inclus, inox seul au-delà | Terminé et testé | Non mesurée |
| 2026-09-01 | Mode AR par caméra avec conservation du rendu métallique PBR via VideoTexture | Terminé et testé | Non mesurée |
| 2026-09-01 | Déplacement et mémorisation de la décalcomanie sur la tige par modèle | Terminé et testé | Non mesurée |
| 2026-09-01 | Logo officiel Rosebuds, noms de cristaux d'origine et matrices de couleurs mises à jour | Terminé et testé | Non mesurée |
| 2026-09-01 | Version v0.2, installateur Inno Setup, réinstallation locale et raccourcis Windows | Terminé et testé | Non mesurée |
| 2026-09-02 | Remplacement du lanceur BAT par un véritable EXE Windows avec serveur local intégré | Terminé et testé | Non mesurée |
| 2026-09-02 | Séparation du paquet web autonome et de l'application de bureau | Terminé et testé | Non mesurée |
| 2026-09-02 | Écran d'identification de la version en ligne avant chargement du catalogue | Terminé et testé | Non mesurée |
| 2026-09-02 | Préparation et publication du dépôt public et du site GitHub Pages | Terminé et vérifié en HTTPS | Non mesurée |
| 2026-09-02 | Compilation de l'EXE, génération de l'installateur v0.3, réinstallation et contrôle du serveur intégré | Terminé et testé | Non mesurée |
| 2026-09-02 | Maintien du logo officiel ROSEBUDS dans le viewer 3D et en AR | Terminé et testé | Non mesurée |
| 2026-09-03 | Connexion publique, parcours NEW SMALL, transfert des filtres et ressources HTTP | Vérifiés ; 21 tests Node réussis | Non mesurée |
| 2026-09-03 | Capture du rendu public et interaction 3D | Non validées : délais du navigateur de test ; AR réel restant à tester | Non mesurée |
| 2026-09-04 | Retrait du nom personnel des en-têtes, conservation de ROSEBUDS | Publié, réponse publique et 21 tests vérifiés | Non mesurée |
| 2026-09-10 | Taille du plug séparée de la taille du cristal, résumé produit et liens Rosebuds | Terminé et testé | Non mesurée |
| 2026-09-10 | Glisser-déposer prioritaire de la décalcomanie par appui long et persistance par modèle | Terminé et testé | Non mesurée |
| 2026-09-10 | Modes guidé, multifiltres croisés et recherche IA locale | Terminé et testé | Non mesurée |
| 2026-09-10 | Rendu optimisé local, objets d'échelle, téléchargement et partage PNG | Terminé et testé | Non mesurée |
| 2026-09-11 | BVH en worker, compilation au repos, bibliothèque de matériaux paresseuse et barre d'actions responsive | Terminé et testé | Non mesurée |

## Prochaines priorités

- 2026-09-14 : préparation v0.5, aperçu PNG et tests de non-régression. Durée non mesurée.
- 2026-09-15 : 28 tests réussis, capture PNG 1600 × 900 vérifiée dans le navigateur intégré ; paquet et publication en cours. Durée non mesurée.

1. Profiler sur plusieurs téléphones la compilation GPU finale des modèles les plus lourds.
2. Compléter les miniatures réelles au fil des nouveaux modèles importés.
3. Étudier un cache persistant des maillages convertis et des BVH.
