# Contact du bronze avec l'assiette

Application : v0.11-260930. Revision de ressources : 20261104-bronze-seat-v11.

## Correction du 4 novembre 2026

L'ancien ajustement alignait un unique sommet arriere du bronze avec un plan
deduit de la boite englobante du corps. Cette tangence ponctuelle ne suffisait
pas a fermer le jour visible autour du bord arrondi.

Le placement partage du viewer compare des enveloppes de triangles des deux
surfaces dans le repere local du modele, sur une grille 96 x 96. La bande
peripherique est echantillonnee en excluant la fixation centrale et les rayons
qui manquent l'assiette. Le cinquieme percentile des ecarts definit l'appui
arriere, avec un enfoncement visuel de 1 % du diametre du bronze pour masquer
la fente de tangence de l'arrondi. La tolerance numerique vaut 0,01 %.

Seule la position du bronze change : aucune deformation, modification de
maillage, de taille ou de materiau. Le placement est idempotent et independant
de l'orientation du groupe dans la scene. Si la surface disponible est
insuffisante, le modele reste charge sans ajustement automatique.

Cette correction concerne les 14 variantes Keyring et leurs apparitions via
le chargeur commun : viewer, comparaisons, apercus de catalogue, PNG, PDF et
devis. Elle ne modifie pas les fichiers Rhino NURBS de fabrication.

## Verification

- `node tests/bronze-seat.test.cjs` : dimensions, sens de l'axe, parents
  transformes, geometrie preservee et idempotence.
- `node scripts/check-bronze-contact.cjs` : vrais modeles dans Chrome,
  rapports et captures dans `outputs/bronze-contact-20261104`.
- L'enfoncement est un ajustement de presentation, pas une validation de
  tolerance mecanique ou de fabricabilite de l'assemblage.

Duree de la tache non mesuree.
