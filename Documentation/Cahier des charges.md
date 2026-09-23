# Cahier des charges - Configurateur de bijoux

Version : **v0.6-260923**

## Révision du 23 septembre 2026

- Les règles récentes priment : gemme/verre pressé pour SMALL et NEW SMALL dans les deux métaux, NEW MEDIUM en inox seulement.
- Cristal XL : 27 ou 35 mm ; cristal NEW : 12 mm. Seconde taille XL renommée XL Plus, identifiant historique XL-45 préservé.
- Noms commerciaux anglais conservés. Résultats par combinaison valide de matériaux, 60 cartes par lot, lien exact par carte. Les captures existantes restent des références de géométrie.
- Déplacement du logo : glissement souris sans attente obligatoire ; appui long tactile ; priorité sur sélection et orbite ; stockage local indépendant par modèle.
- Exports PNG : logo détouré répété en diagonale, après le traitement IA éventuel, jamais dans son entrée.
- Objet d'échelle : fichier original Bouteille_1L_cristal.glb, pas le fichier visionneuse3D. Chargement différé, respect des mètres glTF (hauteur 258,23 mm), texture intégrée, annulation logique si changement de choix pendant le chargement.
- Ouverture directe du HTML : détection de `file:///`, test du serveur Windows local, conservation des paramètres du modèle et reprise automatique sur HTTP. Si le serveur est arrêté, une aide explicite remplace la scène noire.
- Tests : matrice identique catalogue/viewer, configuration exacte par vignette, unités et isolation du cache GLB, geste souris/tactile, filigrane et conservation des sorties existantes.

## Objectifs

- Proposer un catalogue guidé de plugs Rosebuds fondé sur les combinaisons réellement disponibles.
- Charger un modèle choisi dans un viewer Three.js responsive.
- Fournir des métaux, gemmes et supports visuellement crédibles en temps réel.
- Importer des fichiers 3DM, GLB/GLTF, OBJ, FBX, PLY et 3DS.

## Parcours catalogue

1. Gamme de modèle : `Originale`, `NEW MEDIUM` ou `NEW SMALL`, illustrée par un schéma 2D de profil.
2. Pour la gamme `Originale` uniquement : présence d'une tête (`Avec tête` ou `Sans tête`).
3. Taille commerciale du plug, avec diamètre informatif.
4. Taille physique du cristal en millimètres, indépendante de la taille du plug.
5. Famille de métal : aluminium ou inox.
6. Finition compatible du métal.
7. Type d'ornement compatible.
8. Finition ou couleur compatible de l'ornement.
9. Galerie finale des modèles compatibles, avec miniature réelle et nom du modèle.

Les familles `NEW SMALL` et `NEW MEDIUM` ne sont jamais des tailles. Le choix de famille précède celui du diamètre et contraint immédiatement les tailles, ornements et géométries disponibles.

Le catalogue propose un parcours progressif, un multifiltre à facettes croisées et une recherche en langage naturel. La question conditionnelle ne doit jamais apparaître pour les familles NEW. Les branches `Avec tête` et `Sans tête` reposent sur deux listes explicites de fichiers Rhino validés; aucun modèle Originale inconnu ne doit être classé automatiquement à partir de son seul libellé.

Modèles Originale `Avec tête` validés : `LARGE 35`, `MEDIUM`, `SMALL 18`, `SMALL`, `XL 35`, `XL 45 avec assiette`, `XL`, `XXL 35`, `XXL`, `XXXL 60`, `XXXL 70`, `XXXL 80`, `XXXL 90` et `XXXL 100`.

## Viewer

- OrbitControls, zoom, pan et cadrage de sélection.
- Éclairage studio et environnement HDRI.
- Matériaux métalliques PBR paramétriques.
- Pierres transparentes avec lancer de rayons interne au maillage, BVH, Fresnel, réfraction, TIR, dispersion RGB, Beer-Lambert et au moins huit rebonds configurables.
- Matériaux de sol PBR, support masquable et menu contextuel.
- Sélection d'objet et changement de matériau sans altérer la géométrie.
- Chargement avec progression et journal de débogage.
- Rendu rapide interactif conservé pendant la construction BVH en worker; compilation GPU différée tant que l'utilisateur manipule la caméra.
- Mode AR par caméra sur téléphone ou ordinateur, avec flux vidéo intégré comme arrière-plan Three.js et conservation stricte du pipeline PBR du viewer normal.
- Déplacement visuel de la décalcomanie sur la tige, contrainte à la surface métallique, avec mémorisation distincte par modèle.
- Rendu optimisé à la demande par capture haute définition et super-résolution open source côté client.
- Objets 3D de comparaison à dimensions réelles : pièce de monnaie, bouteille détaillée de 1 L issue du fichier fourni et règle graduée 20 cm.
- Téléchargement PNG et partage de la vue courante.
- Résumé du produit et lien vers la fiche Rosebuds la plus proche ou le formulaire sur mesure prérempli.

## Règles métier

- Le plus grand solide d'un plug est traité comme métal lorsque plusieurs volumes sont présents.
- Le petit solide identifié comme ornement reçoit le matériau de pierre/cristal.
- La matrice aluminium est contrainte par classe : `SMALL` = gris/noir/rouge/violet, `MEDIUM` = neuf couleurs, `LARGE` = noir/rouge et `XL` = noir/rouge/violet/orange.
- Les modèles Originale jusqu'au `XL` inclus proposent aluminium et inox; les Originale `XXL` et `XXXL` proposent uniquement l'inox.
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
- Logo officiel ROSEBUDS visible sur l'accueil et dans le viewer 3D, avec contraste adapté au fond, y compris en AR.
- Pas d'éléments non-plugs dans la bibliothèque produit.
- Application Windows lancée par un véritable EXE autonome, sans appel à un BAT ni dépendance à Node.js.
- Version web générée et publiée indépendamment de l'application Windows, avec parité fonctionnelle.
- Écran d'identification chargé avant le catalogue et le viewer sur la version en ligne uniquement.
- Les modèles IA fonctionnent côté client, sans API payante; un repli déterministe doit maintenir la recherche si le modèle n'est pas disponible.

## Tests exigés

- Démarrage et absence d'erreur JavaScript.
- Non-régression des matériaux et de la classification métal/pierre.
- Persistance du shader BVH après changement de matériau.
- Catalogue : choix visuel de la famille avant la taille physique, les deux critères restant strictement séparés.
- Catalogue Originale : sous-question avec ou sans tête immédiatement après la famille, avec filtrage des tailles, ornements et résultats.
- Matrice métal/ornement : validation unitaire de chaque classe aluminium, de l'inox MEDIUM, de l'exception NEW SMALL et de la disponibilité des ornements.
- Contrôle des textes mal encodés.
- Affichage cohérent de la version.
- Mode AR : bouton disponible, demande caméra différée au clic, libération de la caméra à la sortie et conservation des matériaux PBR via `VideoTexture`.
- Déplacements de décalcomanie persistants, bornés à la tige et isolés par identifiant de modèle.
- Lanceur Windows : signature PE valide, serveur local fourni par l'EXE et raccourcis ciblant l'exécutable.
- Version en ligne : paquet autonome, écran d'accès actif, application non chargée avant validation et workflow GitHub Pages présent.
- Catalogue : trois modes cohérents donnant accès aux mêmes combinaisons compatibles.
- Viewer : rendu provisoire conservé pendant le BVH, priorité des interactions avant compilation, objets d'échelle et export/partage PNG.

## À poursuivre

- Export PNG : aperçu persistant avec liens d’ouverture et d’enregistrement, libération des URL temporaires et protection contre les doubles clics. Tests automatisés requis sur les erreurs et le nettoyage.
- Finaliser le rendu génératif hyperréaliste demandé, distinct de la super-résolution Swin2SR actuelle.
- Valider le partage natif et l’AR sur téléphone réel, ainsi que le geste de décalcomanie dans le navigateur.

- Génération automatisée de miniatures pour chaque nouvelle combinaison importée.
- Profilage GPU sur appareils mobiles modestes.
- Conversion CAD serveur optionnelle pour retessellation NURBS haute précision.
