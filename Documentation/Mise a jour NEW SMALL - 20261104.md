# NEW SMALL - geometrie du metal du 4 novembre 2026

Application v0.11-260930 ; revision des ressources 20261104-new-small-v11.

## Sources de reference

Les deux fichiers du dossier CLIENTS/ROSEBUDS/MODELES 3D/PLUGS/NEW SMALL, modifies le 3 novembre, remplacent exactement leurs copies assets/models/plugs/new-small : cabochon lisse et cristal. Aucun changement des fichiers sources, des modeles des autres gammes ni des regles de materiaux.

Les deux ornements ont ete compares aux anciennes copies : topologie et neuf points UV par face identiques (ecart nul). Les six faces du corps metallique possedent toutes un maillage de rendu exploitable ; 20476 sommets de rendu au total pour le metal. La detection des composants reste volumique, sans dependance a l'ordre des objets dans le fichier Rhino.

## Propagation

- Viewer simple, comparaison des tailles et comparaison libre : les memes definitions de modeles et le meme chargeur Rhino lisent les deux ressources mises a jour.
- Recherche guidee, multicriteres et prompt : les memes identifiants de catalogue sont conserves. Les deux vignettes statiques sont regenerees depuis le viewer.
- Captures PNG, apercus de devis et fiches PDF : generes depuis le viewer utilisant la nouvelle geometrie.
- Liens partages et liens des e-mails : identifiants inchanges ; le nouveau cache-buster force la lecture de la ressource courante au prochain chargement.
- Comparatifs Rhino : 07, 08 et deux assemblages de catalogue contiennent deja cette nouvelle geometrie. Controle des surfaces transforme/refait sans reecriture : erreur maximale 4.55e-13 mm. Le fichier PLUGS SUR MESURE ne contient pas de NEW SMALL.

## Integrite et caches

scripts/sync-new-small.py : audit, sauvegarde des deux anciennes copies, copie controlee SHA256, verification des pierres et des quatre occurrences dans les comparatifs. Rapport outputs/new-small-20261104/audit.json. Sauvegardes avant-mise-a-jour dans le meme dossier.

model-integrity.json couvre toujours les 37 ressources. Seules les deux empreintes NEW SMALL changent. NEW_SMALL_ASSET_VERSION invalide les caches HTTP de ces modeles sans invalider les caches des autres gammes. Le cache applicatif et les vignettes portent aussi la nouvelle revision.

La personnalisation du prenom, en cours dans le dossier de travail, est une evolution distincte : elle ne doit pas etre publiee par inadvertance dans cette livraison de geometrie.

## Recette realisee

59 fichiers de tests passent dans le dossier de livraison. Chrome charge les deux nouvelles URL versionnees ; pour chaque variante le metal possede 20476 sommets de rendu. Les materiaux sont conserves : metal lisse, cabochon lisse et cristal facette. Canvas non vide confirme par lecture de pixels apres rendu ; comparaison des tailles chargee et captures mobiles controlees. Les vignettes sont recalculees au format 900x600 du catalogue. Rapport browser-check.json et captures dans outputs/new-small-20261104.
