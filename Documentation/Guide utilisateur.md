# Guide utilisateur - Configurateur de bijoux

Version : **v0.6-260923**

## Objectif

Le configurateur permet de choisir un plug Rosebuds compatible par taille, métal, finition et ornement, puis de l'examiner dans un viewer Three.js photoréaliste.

## Démarrage

1. Lancez `Configurateur de Bijoux Rosebuds.exe` ou le raccourci `Configurateur de Bijoux` du Bureau.
2. Ouvrez `http://localhost:8080/` si le navigateur ne s'ouvre pas automatiquement.
3. Choisissez le mode `Choix successifs`, `Multifiltres` ou `Recherche par prompt IA`.
4. Cliquez sur une miniature de modèle pour charger le viewer 3D complet.

Ne double-cliquez pas directement sur `index.html` : une adresse commençant par `file:///` ne permet pas au navigateur de charger de façon fiable les modules, workers et modèles 3D. À partir de la version 0.6, cette ouverture est détectée : le configurateur rejoint automatiquement `http://localhost:8080/` si l'application est lancée, ou affiche une aide de reprise à la place d'un viewer noir.

## Catalogue

Le premier choix détermine la gamme de profil : `Originale`, `NEW MEDIUM` ou `NEW SMALL`. Chaque gamme est représentée par un schéma 2D de profil qui permet de comparer l'assiette, la tige et le corps du plug.

Pour la gamme `Originale`, une sous-question demande immédiatement si le plug doit être `Avec tête` ou `Sans tête`. Le choix `Avec tête` propose uniquement les fichiers Rhino validés de LARGE 35 à XXXL 100. Les modèles NEW SMALL et NEW MEDIUM passent directement au choix suivant.

Le choix suivant conserve l'appellation de taille du plug (`SMALL`, `MEDIUM`, `LARGE`, `XL`, `XXL`, `XXXL`) et affiche son diamètre en dessous. Une question distincte demande ensuite la taille du cristal, car un même plug peut recevoir plusieurs diamètres de cristal.

Les choix suivants filtrent le métal, la finition du métal, le type d'ornement et sa finition. Seules les combinaisons présentes dans la bibliothèque de modèles sont proposées.

Les finitions métalliques dépendent du modèle :

- `NEW SMALL` aluminium : noir uniquement.
- `SMALL` aluminium classique : gris, noir, rouge ou violet.
- `MEDIUM` aluminium : toutes les neuf couleurs.
- `LARGE` aluminium : noir ou rouge.
- `XL` aluminium classique : noir, rouge, violet ou orange.
- Les modèles Originale jusqu'au `XL` inclus proposent aluminium et inox. Les tailles Originale `XXL` et `XXXL` sont disponibles uniquement en inox.
- Inox : poli miroir pour toutes les tailles; le flash or 1 micron est réservé aux modèles `MEDIUM`.

Le cristal est proposé sur toutes les familles possédant une tête. La gemme et le verre pressé sont disponibles sur `SMALL` et `NEW SMALL` en aluminium ou inox, et sur `NEW MEDIUM` en inox uniquement, lorsqu'une géométrie correspondante existe.

Les cristaux du `XL` font 27 ou 35 mm. Les familles `NEW SMALL` et `NEW MEDIUM` affichent 12 mm. La seconde taille XL (plug de 45 mm) est appelée `XL Plus`; les anciens liens restent valides.

La galerie distingue les combinaisons de matériaux avec leur nom et leurs pastilles de couleur. Les captures illustrent la géométrie de référence, pas chaque couleur finale : la combinaison choisie est appliquée dans le viewer au clic. Les résultats sont affichés par lots de 60. Les noms commerciaux anglais (Aquamarine, Purple, Green, Blue Agata, Tiger Eye, etc.) sont conservés.

Les noms de couleurs de cristal conservent leur appellation commerciale d'origine. Les modèles `XXL 50` et `XXXL 50` proposent l'ensemble des couleurs de cristal; les autres tailles restent filtrées par leur matrice de disponibilité.

### Autres modes de recherche

- `Multifiltres` affiche tous les critères simultanément. Chaque choix recalcule les autres listes afin qu'aucune combinaison impossible ne soit proposée.
- `Recherche par prompt IA` accepte une description libre. Une analyse immédiate locale affiche les résultats, puis un petit LLM open source exécuté côté navigateur peut affiner les critères. Le modèle est téléchargé au premier usage, mis en cache et remplacé automatiquement par l'analyse déterministe si WebGPU, le réseau ou le modèle sont indisponibles.

## Viewer 3D

- Clic gauche et glisser : rotation orbitale.
- Molette : zoom.
- Clic droit sur une pièce : matériaux compatibles.
- Double-clic sur un objet : zoom sur la sélection.
- Bouton en haut à droite : ouvrir ou réduire le panneau de réglages.
- Le logo officiel ROSEBUDS reste visible dans l'en-tête du viewer 3D et adapte son contraste au fond de la scène.
- `Voir en AR` : active la caméra et place le plug devant le flux vidéo. Le rendu métallique conserve les mêmes matériaux PBR, l'environnement et l'exposition que le viewer normal.
- Glisser directement à la souris sur le logo ROSEBUDS : déplace la décalcomanie sur la tige sans sélectionner le métal ni faire tourner le plug. Sur écran tactile, maintenir un appui long avant de glisser. Sa position est mémorisée séparément pour chaque modèle dans ce navigateur et sur cette adresse du site. Échap annule le déplacement en cours.
- `Rendu optimisé` : lisse temporairement les métaux, capture la vue en haute définition et applique, lorsqu'il est disponible, le modèle open source Swin2SR dans un worker local.
- `Objet d'échelle` : affiche une pièce de 1 euro, une bouteille détaillée de 1 L ou une règle graduée de 20 cm à la même échelle que le plug. La bouteille fournie mesure environ 258,23 mm de haut, conserve son étiquette et ses matériaux, et se charge uniquement à la demande.

### Dépannage du viewer noir

- Vérifiez que l'adresse commence par `http://localhost:8080/` pour l'application installée ou par l'adresse HTTPS du site publié, et non par `file:///`.
- Si le panneau et les boutons apparaissent mais que la scène reste noire après une ouverture directe du HTML, lancez `Configurateur de Bijoux Rosebuds` depuis le menu Démarrer. La page locale détecte ensuite le serveur et reprend automatiquement le même modèle et ses paramètres.
- Pendant la compilation du lancer de rayons, le modèle reste manipulable dans un rendu provisoire. La barre fine au bas de la page indique l'étape et le pourcentage d'avancement.
- `Télécharger PNG` : produit une image de la vue courante et ouvre son aperçu. Si le téléchargement automatique est bloqué, utilisez `Enregistrer le PNG` ou `Ouvrir l’image`. L’image reste accessible jusqu’à la fermeture de l’aperçu.
- `Partager` : utilise la fonction native du navigateur lorsqu'elle existe.

Les images PNG exportées ou partagées, y compris le rendu optimisé, portent des filigranes ROSEBUDS détourés, semi-transparents, régulièrement espacés en diagonale. Le viewer et l'image envoyée au calcul IA ne sont pas filigranés.

Les pierres transparentes utilisent un shader optique accéléré par BVH avec Fresnel, réfraction, réflexion totale interne, dispersion RGB et rebonds internes. Un rendu PBR rapide reste visible immédiatement. Le BVH est construit dans un worker et la compilation GPU finale attend la fin des interactions; une fine barre en bas indique l'étape et le pourcentage.

Le mode AR demande l'autorisation d'utiliser la caméra. Il fonctionne sur `localhost` et sur une adresse HTTPS; l'accès caméra est normalement refusé par les navigateurs sur une adresse HTTP distante non sécurisée.

## Import 3DM

Les BREP et polysurfaces Rhino sont convertis en maillages d'affichage par `Rhino3dmLoader`. Les lignes, cotations et annotations sont ignorées. Le panneau d'import permet de régler le lissage et la finesse, mais la qualité de silhouette dépend aussi du maillage de rendu contenu dans le fichier Rhino.

## Dépannage

- Modèle absent : utilisez `Journal de débogage`, puis `Réparer import`.
- Chargement long : le rendu rapide doit rester manipulable; suivez la barre basse pendant la conversion, la construction BVH et la compilation du shader.
- Pierre blanche ou mate : vérifiez qu'elle est reconnue comme pierre/cristal et qu'un matériau transparent est sélectionné.
- Page inaccessible : fermez le processus `Configurateur de Bijoux Rosebuds.exe`, puis relancez l'application depuis son raccourci.
- Métal trop sombre en AR : rechargez la version courante; le flux caméra doit être rendu comme `VideoTexture` Three.js et non comme une couche HTML transparente.

## Limites

Le viewer est un rendu temps réel WebGL. Il simule plusieurs phénomènes optiques dans la pierre, mais ne remplace pas un rendu spectral hors ligne de type Cycles.

Le rendu optimisé emploie une super-résolution Swin2SR, pas encore un moteur de génération d’images ComfyUI. Les poids IA sont téléchargés au premier usage puis mis en cache ; ils ne sont pas intégralement embarqués dans l’installateur.

## Version en ligne

La version publiée à l'adresse https://rsbds-3d.github.io/configurateur/ est indépendante de l'installation Windows mais fournit le même catalogue, les mêmes modèles, matériaux, fonctions 3D et fonctions AR. Elle demande un identifiant et un mot de passe avant de charger l'application. L'autorisation est mémorisée uniquement pendant la session de l'onglet.

GitHub Pages étant statique, cette barrière protège l'accès normal à l'interface mais pas les fichiers contre une personne capable d'inspecter directement le dépôt ou les URL. Une authentification côté serveur reste nécessaire pour une confidentialité forte.
