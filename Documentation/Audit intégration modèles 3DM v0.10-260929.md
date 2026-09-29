# Audit d'intégration des modèles 3DM - v0.10-260929

## Périmètre

Les 37 fichiers Rhino fournis dans `C:\Users\charl\Documents\CLIENTS\ROSEBUDS\MODELES 3D\PLUGS` remplacent les 37 modèles du catalogue : 21 Originale, 14 NEW MEDIUM et 2 NEW SMALL. Les fichiers historiques rangés dans les dossiers `Anciens fichiers` ne sont pas importés.

La correspondance exacte source/cible est conservée dans `assets/models/plugs/model-source-manifest.json`. Le script `scripts/update-plug-models.ps1` contrôle les doublons, l'existence des fichiers, les chemins autorisés et les empreintes SHA-256 avant toute copie. Il produit ensuite `assets/models/plugs/model-integrity.json`, utilisé par le test de non-régression.

## Processus appliqué

1. Inventaire des 37 sources et association explicite à l'identifiant de modèle utilisé par le catalogue.
2. Audit des documents 3DM avec `rhino3dm` : objets, BREP, faces BREP et maillages de rendu de chaque face.
3. Comparaison avec les fichiers précédemment intégrés avant remplacement.
4. Copie contrôlée et idempotente des nouvelles versions vers `assets/models/plugs`.
5. Vérification après copie : 37 fichiers sur 37 strictement conformes en taille et SHA-256, aucune cible manquante.
6. Chargement par le pipeline existant `Rhino3dmLoader`, normalisation du repère Rhino, classification métal/pierre par volume, traitement des normales, matériaux PBR, décalcomanie puis shader optique BVH.
7. Ajout d'un cache-buster de géométrie pour empêcher le navigateur de réutiliser les anciennes versions portant les mêmes noms.
8. Contrôle visuel dans Three.js des familles Originale, NEW MEDIUM et NEW SMALL.

## Mesures avant/après

La structure fonctionnelle est restée stable pour les 37 modèles : aucun écart sur le nombre d'objets, de BREP ou de faces BREP. Les 37 maillages de rendu ont en revanche été renouvelés et sont plus détaillés.

| Famille | Fichiers | Sommets avant | Sommets après | Faces avant | Faces après |
|---|---:|---:|---:|---:|---:|
| Originale | 21 | 133 041 | 437 573 | 129 277 | 432 355 |
| NEW MEDIUM | 14 | 124 151 | 286 337 | 119 380 | 282 481 |
| NEW SMALL | 2 | 19 326 | 37 555 | 19 120 | 38 095 |
| **Total** | **37** | **276 518** | **761 465** | **267 777** | **752 931** |

Le nombre total de sommets de rendu est multiplié par 2,75 et celui des faces par 2,81. Chaque fichier, sans exception, possède un maillage de rendu plus fin. Par exemple, l'Originale XXXL 100 passe de 6 151 à 45 684 sommets et le NEW SMALL cristal de 7 731 à 18 897 sommets.

Ces mesures attestent d'une tessellation plus dense, donc de silhouettes et reflets moins facettisés. Elles ne constituent pas, seules, une mesure absolue de qualité esthétique : le contrôle visuel Three.js a également vérifié les volumes, les matériaux, les pierres et l'absence d'écran noir.

## Déplacement de la décalcomanie

La position initiale reste calculée sur la partie fine de la tige. La course de glissement utilise désormais le profil axial complet du solide, avec interpolation du rayon local : le logo suit l'élargissement de la pièce et peut atteindre ses extrémités sans la précédente butée invisible. Un retrait technique de 0,5 % au maximum protège uniquement la projection au bord du maillage.

## Vérifications automatisées

- `tests/plug-model-integrity.test.cjs` protège les 37 associations, tailles, empreintes, identifiants et chemins chargés.
- `tests/decal-position.test.cjs` protège la priorité de sélection du logo, sa persistance, sa course complète et l'adaptation au rayon local.
- L'ensemble de la suite Node doit rester vert avant génération du paquet web, de l'EXE et de l'installateur.
