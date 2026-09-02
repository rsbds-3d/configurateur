# Cahier des charges - Configurateur de bijoux

Version : **v0.3-260902**

## Objectifs

- Proposer un catalogue guidé de plugs Rosebuds fondé sur les combinaisons réellement disponibles.
- Charger un modèle choisi dans un viewer Three.js responsive.
- Fournir des métaux, gemmes et supports visuellement crédibles en temps réel.
- Importer des fichiers 3DM, GLB/GLTF, OBJ, FBX, PLY et 3DS.

## Parcours catalogue

1. Famille de modèle : `Classique`, `NEW MEDIUM` ou `NEW SMALL`, illustrée par un schéma 2D de profil.
2. Pour la famille `Classique` uniquement : présence d'une tête (`Avec tête` ou `Sans tête`).
3. Taille physique du cristal en millimètres, filtrée selon la famille et la présence de tête choisies.
4. Famille de métal : aluminium ou inox.
5. Finition compatible du métal.
6. Type d'ornement compatible.
7. Finition ou couleur compatible de l'ornement.
8. Galerie finale des modèles compatibles, avec miniature réelle et nom du modèle.

Les familles `NEW SMALL` et `NEW MEDIUM` ne sont jamais des tailles. Le choix de famille précède celui du diamètre et contraint immédiatement les tailles, ornements et géométries disponibles.

Le parcours comporte six choix pour `NEW SMALL` et `NEW MEDIUM`, et sept pour `Classique`. La question conditionnelle ne doit jamais apparaître pour les familles NEW. Les branches `Avec tête` et `Sans tête` reposent sur deux listes explicites de fichiers Rhino validés; aucun modèle Classique inconnu ne doit être classé automatiquement à partir de son seul libellé.

Modèles Classiques `Avec tête` validés : `LARGE 35`, `MEDIUM`, `SMALL 18`, `SMALL`, `XL 35`, `XL 45 avec assiette`, `XL`, `XXL 35`, `XXL`, `XXXL 60`, `XXXL 70`, `XXXL 80`, `XXXL 90` et `XXXL 100`.

## Viewer

- OrbitControls, zoom, pan et cadrage de sélection.
- Éclairage studio et environnement HDRI.
- Matériaux métalliques PBR paramétriques.
- Pierres transparentes avec lancer de rayons interne au maillage, BVH, Fresnel, réfraction, TIR, dispersion RGB, Beer-Lambert et au moins huit rebonds configurables.
- Matériaux de sol PBR, support masquable et menu contextuel.
- Sélection d'objet et changement de matériau sans altérer la géométrie.
- Chargement avec progression et journal de débogage.
- Mode AR par caméra sur téléphone ou ordinateur, avec flux vidéo intégré comme arrière-plan Three.js et conservation stricte du pipeline PBR du viewer normal.
- Déplacement visuel de la décalcomanie sur la tige, contrainte à la surface métallique, avec mémorisation distincte par modèle.

## Règles métier

- Le plus grand solide d'un plug est traité comme métal lorsque plusieurs volumes sont présents.
- Le petit solide identifié comme ornement reçoit le matériau de pierre/cristal.
- La matrice aluminium est contrainte par classe : `SMALL` = gris/noir/rouge/violet, `MEDIUM` = neuf couleurs, `LARGE` = noir/rouge et `XL` = noir/rouge/violet/orange.
- Les modèles Classiques jusqu'au `XL` inclus proposent aluminium et inox; les Classiques `XXL` et `XXXL` proposent uniquement l'inox.
- La famille `NEW SMALL` surcharge la règle `SMALL` : aluminium noir uniquement.
- L'inox propose le poli miroir sur toutes les tailles et le flash or 1 micron uniquement sur `MEDIUM`.
- Le cristal est compatible avec toutes les familles à tête. Gemme et verre pressé sont limités à `SMALL`, `NEW SMALL` et `NEW MEDIUM`; la gemme est interdite sur `NEW SMALL` aluminium.
- Les couleurs de cristal conservent leur nom commercial d'origine. Les tailles `XXL 50` et `XXXL 50` acceptent toutes les couleurs de cristal.
- Les mêmes règles doivent filtrer les questions d'accueil, la galerie finale, les paramètres d'URL et le menu contextuel du viewer.
- Un changement de matériau ne change ni forme, ni échelle, ni position.
- Un changement de forme ou de diamètre conserve le matériau et le point d'ancrage.
- Les modèles multiples sont disposés parallèlement avec un jeu réglable.

## Contraintes

- Exécution locale sans serveur applicatif lourd.
- Interface responsive et panneau réduit par défaut.
- Texte français correctement encodé en UTF-8.
- Version visible dans l'interface.
- Pas d'éléments non-plugs dans la bibliothèque produit.
- Application Windows lancée par un véritable EXE autonome, sans appel à un BAT ni dépendance à Node.js.
- Version web générée et publiée indépendamment de l'application Windows, avec parité fonctionnelle.
- Écran d'identification chargé avant le catalogue et le viewer sur la version en ligne uniquement.

## Tests exigés

- Démarrage et absence d'erreur JavaScript.
- Non-régression des matériaux et de la classification métal/pierre.
- Persistance du shader BVH après changement de matériau.
- Catalogue : choix visuel de la famille avant la taille physique, les deux critères restant strictement séparés.
- Catalogue Classique : sous-question avec ou sans tête immédiatement après la famille, avec filtrage des tailles, ornements et résultats.
- Matrice métal/ornement : validation unitaire de chaque classe aluminium, de l'inox MEDIUM, de l'exception NEW SMALL et de la disponibilité des ornements.
- Contrôle des textes mal encodés.
- Affichage cohérent de la version.
- Mode AR : bouton disponible, demande caméra différée au clic, libération de la caméra à la sortie et conservation des matériaux PBR via `VideoTexture`.
- Déplacements de décalcomanie persistants, bornés à la tige et isolés par identifiant de modèle.
- Lanceur Windows : signature PE valide, serveur local fourni par l'EXE et raccourcis ciblant l'exécutable.
- Version en ligne : paquet autonome, écran d'accès actif, application non chargée avant validation et workflow GitHub Pages présent.

## À poursuivre

- Génération automatisée de miniatures pour chaque nouvelle combinaison importée.
- Profilage GPU sur appareils mobiles modestes.
- Conversion CAD serveur optionnelle pour retessellation NURBS haute précision.
