# Configurateur de Bijoux Rosebuds

Version actuelle : **v0.4-260911**

Configurateur de plugs Rosebuds avec catalogue guidé, import de modèles Rhino 3DM, matériaux métalliques PBR, pierres transparentes avec shader optique BVH et mode caméra AR.

- Site en ligne : https://rsbds-3d.github.io/configurateur/
- Code source : https://github.com/rsbds-3d/configurateur

## Application Windows

L'application se lance avec le véritable exécutable :

```text
Configurateur de Bijoux Rosebuds.exe
```

Cet EXE Windows démarre directement le serveur local sur `http://localhost:8080/` et ouvre le navigateur. Il n'appelle aucun fichier BAT et ne dépend pas de Node.js.

Compilation du lanceur :

```powershell
./launcher/build-launcher.ps1
```

L'installateur Inno Setup est généré dans `FICHIER D'INSTALLATION/`. Les raccourcis Bureau et menu Démarrer ciblent exclusivement l'EXE installé dans `C:\Program Files\Configurateur de Bijoux Rosebuds`.

## Version en ligne

La version web est un livrable autonome distinct de l'application Windows. Elle reprend les mêmes fichiers fonctionnels, modèles et matériaux, puis ajoute son propre écran d'identification avant de charger le catalogue.

Génération locale :

```powershell
./online/build-online.ps1
```

Le site généré se trouve dans `online/dist/`. Le workflow `.github/workflows/deploy-pages.yml` le publie sur GitHub Pages à chaque envoi sur la branche `master`, à l'adresse https://rsbds-3d.github.io/configurateur/.

La barrière d'accès GitHub Pages est exécutée côté navigateur. Elle empêche l'accès normal à l'interface mais ne remplace pas une authentification serveur. Pour protéger également les fichiers et modèles contre un accès direct, le site devra être placé derrière Cloudflare Access ou un hébergement disposant d'une authentification côté serveur.

## Fonctionnalités

- Trois recherches du catalogue : choix successifs, multifiltres croisés et prompt en langage naturel.
- Choix distincts de la gamme, de la taille du plug et de la taille du cristal.
- Matrices de compatibilité propres aux modèles Originale, NEW SMALL et NEW MEDIUM.
- Miniatures réelles et chargement différé du viewer 3D.
- Import Rhino 3DM avec classification métal/pierre par volume.
- Matériaux métalliques PBR et pierres transparentes avec réfraction, Fresnel, dispersion, TIR et BVH.
- Rendu rapide manipulable, calcul BVH en worker et progression des calculs lourds.
- Recherche IA locale avec Transformers.js et repli déterministe hors ligne.
- Rendu optimisé à la demande avec lissage PBR et super-résolution Swin2SR locale.
- Déplacement prioritaire de la décalcomanie par appui long et mémorisation par modèle.
- Mode AR par caméra avec conservation du rendu Three.js.
- Objets d'échelle réels, export PNG et partage natif de la vue.
- Affichage parallèle de plusieurs plugs.

## Tests

```powershell
Get-ChildItem tests/*.test.cjs | ForEach-Object { node $_.FullName }
```

La version `v0.4-260911` possède 27 tests unitaires et de non-régression.
