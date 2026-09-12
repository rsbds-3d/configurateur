# Bibliotheques du worker optique

- Three.js 0.164.1 : https://unpkg.com/three@0.164.1/build/three.module.js
- three-mesh-bvh 0.7.6 : https://unpkg.com/three-mesh-bvh@0.7.6/build/index.module.js
- Licences MIT conservees dans ce dossier.

Ces versions sont celles deja utilisees par le viewer, sans montee de dependance.
Le seul ajustement du module BVH est le remplacement de son import nu `three`
par `./three.module.js`, car les workers ne partagent pas l'import map de la page.
La page et le worker utilisent ainsi les memes fichiers distribues avec le site.
