# Planning et suivi

Version : **v0.3-260902**

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
| 2026-09-02 | Préparation du workflow de publication GitHub Pages | En cours | Non mesurée |

## Prochaines priorités

1. Profiler le temps de construction BVH sur les modèles les plus lourds.
2. Compléter les miniatures réelles au fil des nouveaux modèles importés.
3. Étudier un cache persistant des maillages convertis et des BVH.
