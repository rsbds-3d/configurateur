# Activation FormSubmit Rosebuds

Version v0.11-260930. Mise a jour du 20 octobre 2026. Duree non mesuree.

## Methode retenue

Sur demande explicite de l'utilisateur : methode AMS sans pieces jointes, POST AJAX JSON vers https://formsubmit.co/ajax/info@rosebuds.net. FormSubmit est le backend tiers ; aucun serveur propre a Rosebuds n'est necessaire. Le destinataire est fixe dans assets/js/contact-formsubmit.js, jamais saisi par le client. Les champs email et _replyto correspondent au client. Objet avec reference RB-, template table. Aucun To/CC/BCC libre ni secret navigateur.

assets/data/contact-config.json selectionne provider formsubmit. Le backend Resend et ses tests sont conserves comme alternative : pour le reactiver, selectionner provider backend et suivre Formulaire de devis - deploiement.md.

## Liens et fichiers

L'apercu 3D reste local dans la modale. Aucun fichier n'est transmis. Message et champ viewer_3D contiennent une URL HTTPS GitHub du viewer avec les parametres produit autorises : modele, famille, tete/bronze, taille, cristal, metal et finition, ornement et finition. Aucune coordonnee personnelle ni URL localhost dans ce lien. L'identification existante est conservee : le destinataire doit disposer des acces au configurateur.

PNG et fiche PDF restent telechargeables depuis le viewer. Ils sont generes a la demande, pas heberges : aucun faux lien direct vers un fichier public. Les materiaux multiples affectes par piece ne sont pas serialises ; le lien reproduit la finition principale et le courriel indique cette limite. Consulter le descriptif du devis pour les autres finitions.

## Activation et verification obligatoires

1. Depuis le site public, une personne autorisee soumet une premiere demande.
2. Dans info@rosebuds.net, verifier reception et indesirables puis cliquer le lien d'activation FormSubmit.
3. Apres autorisation explicite, envoyer une nouvelle configuration connue. Ne pas supposer que la demande precedant l'activation est livree.
4. Verifier reception, objet/reference RB-, accents, caracteristiques, adresse du bouton Repondre et lien ouvrant la bonne configuration. Verifier PNG et PDF depuis le viewer, sur bureau et mobile.

Aucun envoi reel ni test de boite destinataire n'a ete effectue par Codex. Une reponse success signifie prise en charge du service, pas activation terminee ni reception finale. L'UI l'indique. Ne pas declarer la fonctionnalite pleinement operationnelle avant cette recette.

## Protections et limites

Validation native, honeypot, attente minimale locale, bouton bloque durant l'envoi et apres acceptation, champs conserves en erreur et fermeture. Comme AMS, _captcha=false pour AJAX. Les protections navigateur ne sont pas des controles serveur. Les garanties d'antivirus, idempotence persistante, limitation IP et webhook du backend alternatif ne s'appliquent PAS ici. Pas de suivi de rebond disponible dans cette integration. En cas de timeout, verifier avant de renvoyer pour eviter un doublon.

Coordonnees, message et configuration transitent via FormSubmit. Sa documentation annonce conserver les soumissions 30 jours. La modale le mentionne et lie sa politique. Aucune donnee client n'est publiee dans GitHub. Faire valider le choix du sous-traitant et les conditions de traitement par le responsable de Rosebuds. Ne pas collecter de donnees sensibles inutiles.

## Sources officielles verifiees

- https://formsubmit.co/documentation
- https://formsubmit.co/ajax-documentation
- https://formsubmit.co/
- https://formsubmit.co/privacy.pdf
