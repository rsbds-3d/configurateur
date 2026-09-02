# Guide utilisateur - Configurateur de bijoux

Version : **v0.3-260902**

## Objectif

Le configurateur permet de choisir un plug Rosebuds compatible par taille, métal, finition et ornement, puis de l'examiner dans un viewer Three.js photoréaliste.

## Démarrage

1. Lancez `Configurateur de Bijoux Rosebuds.exe` ou le raccourci `Configurateur de Bijoux` du Bureau.
2. Ouvrez `http://localhost:8080/` si le navigateur ne s'ouvre pas automatiquement.
3. Répondez aux choix successifs du catalogue.
4. Cliquez sur une miniature de modèle pour charger le viewer 3D complet.

## Catalogue

Le premier choix détermine la famille de profil : `Classique`, `NEW MEDIUM` ou `NEW SMALL`. Chaque famille est représentée par un schéma 2D de profil qui permet de comparer l'assiette, la tige et le corps du plug.

Pour la famille `Classique`, une sous-question demande immédiatement si le plug doit être `Avec tête` ou `Sans tête`. Le choix `Avec tête` propose uniquement les fichiers Rhino Classiques validés de LARGE 35 à XXXL 100. Les modèles NEW SMALL et NEW MEDIUM passent directement au choix suivant.

Le choix suivant correspond au diamètre physique du cristal en millimètres. Seules les dimensions réellement disponibles pour la famille et, pour les Classiques, la présence de tête sélectionnées sont affichées.

Les choix suivants filtrent le métal, la finition du métal, le type d'ornement et sa finition. Seules les combinaisons présentes dans la bibliothèque de modèles sont proposées.

Les finitions métalliques dépendent du modèle :

- `NEW SMALL` aluminium : noir uniquement.
- `SMALL` aluminium classique : gris, noir, rouge ou violet.
- `MEDIUM` aluminium : toutes les neuf couleurs.
- `LARGE` aluminium : noir ou rouge.
- `XL` aluminium classique : noir, rouge, violet ou orange.
- Les modèles Classiques jusqu'au `XL` inclus proposent aluminium et inox. Les tailles Classiques `XXL` et `XXXL` sont disponibles uniquement en inox.
- Inox : poli miroir pour toutes les tailles; le flash or 1 micron est réservé aux modèles `MEDIUM`.

Le cristal est proposé sur toutes les familles possédant une tête. La gemme et le verre pressé sont réservés aux modèles `SMALL`, `NEW SMALL` et `NEW MEDIUM`. Sur un `NEW SMALL` en aluminium, la gemme n'est pas proposée; le cristal et le verre pressé restent disponibles lorsqu'un modèle correspondant existe.

Les noms de couleurs de cristal conservent leur appellation commerciale d'origine. Les modèles `XXL 50` et `XXXL 50` proposent l'ensemble des couleurs de cristal; les autres tailles restent filtrées par leur matrice de disponibilité.

## Viewer 3D

- Clic gauche et glisser : rotation orbitale.
- Molette : zoom.
- Clic droit sur une pièce : matériaux compatibles.
- Double-clic sur un objet : zoom sur la sélection.
- Bouton en haut à droite : ouvrir ou réduire le panneau de réglages.
- Le logo officiel ROSEBUDS reste visible dans l'en-tête du viewer 3D et adapte son contraste au fond de la scène.
- `Voir en AR` : active la caméra et place le plug devant le flux vidéo. Le rendu métallique conserve les mêmes matériaux PBR, l'environnement et l'exposition que le viewer normal.
- `Déplacer le logo` : permet de faire glisser la décalcomanie à la souris sur la tige. Sa position est mémorisée séparément pour chaque modèle dans le navigateur.

Les pierres transparentes utilisent un shader optique accéléré par BVH avec Fresnel, réfraction, réflexion totale interne, dispersion RGB et rebonds internes. Le calcul est limité au maillage de la pierre pour conserver un affichage interactif.

Le mode AR demande l'autorisation d'utiliser la caméra. Il fonctionne sur `localhost` et sur une adresse HTTPS; l'accès caméra est normalement refusé par les navigateurs sur une adresse HTTP distante non sécurisée.

## Import 3DM

Les BREP et polysurfaces Rhino sont convertis en maillages d'affichage par `Rhino3dmLoader`. Les lignes, cotations et annotations sont ignorées. Le panneau d'import permet de régler le lissage et la finesse, mais la qualité de silhouette dépend aussi du maillage de rendu contenu dans le fichier Rhino.

## Dépannage

- Modèle absent : utilisez `Journal de débogage`, puis `Réparer import`.
- Chargement long : attendez la fin des étapes de conversion, de construction BVH et de compilation du shader.
- Pierre blanche ou mate : vérifiez qu'elle est reconnue comme pierre/cristal et qu'un matériau transparent est sélectionné.
- Page inaccessible : fermez le processus `Configurateur de Bijoux Rosebuds.exe`, puis relancez l'application depuis son raccourci.
- Métal trop sombre en AR : rechargez la version courante; le flux caméra doit être rendu comme `VideoTexture` Three.js et non comme une couche HTML transparente.

## Limites

Le viewer est un rendu temps réel WebGL. Il simule plusieurs phénomènes optiques dans la pierre, mais ne remplace pas un rendu spectral hors ligne de type Cycles.

## Version en ligne

La version publiée sur GitHub Pages est indépendante de l'installation Windows mais fournit le même catalogue, les mêmes modèles, matériaux, fonctions 3D et fonctions AR. Elle demande un identifiant et un mot de passe avant de charger l'application. L'autorisation est mémorisée uniquement pendant la session de l'onglet.

GitHub Pages étant statique, cette barrière protège l'accès normal à l'interface mais pas les fichiers contre une personne capable d'inspecter directement le dépôt ou les URL. Une authentification côté serveur reste nécessaire pour une confidentialité forte.
