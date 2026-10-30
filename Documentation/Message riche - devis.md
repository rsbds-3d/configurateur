# Message riche des demandes de devis

Application v0.11-260930 - evolution du 30 octobre 2026.

Le formulaire propose Gras, Italique et Liste a puces. Le texte reste editable et copiable ; les marqueurs **gras**, _italique_ et les lignes commencant par un tiret sont transformes en HTML dans l'e-mail. Le volet Apercu du message montre le resultat avant envoi.

Les lignes de caracteristiques du message pre-rempli sont remplacees par un tableau deux colonnes, bordures fines, en-tete noir et alternance blanc/rose pale. Les valeurs proviennent toujours de configurationRows ; si le client remplace entierement son message, le tableau officiel est conserve. Les caracteristiques ne sont pas repetees dans un second tableau.

## Technique et securite

- assets/js/quote-message-html.js : conversion d'un sous-ensemble limite de mise en forme ; tout texte utilisateur et toute valeur de configuration sont echappes avant insertion. Aucun HTML fourni directement par le client n'est interprete.
- contact-emailjs.js transmet message (texte) et message_html (HTML construit par le convertisseur).
- Modele EmailJS rosebuds_devis_html : rendu conditionnel de message_html ; repli sur message et tableau historique si le champ manque. Cette compatibilite permet de garder les anciennes versions utilisables pendant le deploiement.
- To fixe info@rosebuds.net, From Configurateur Rosebuds et Reply-To client inchanges. Aucun e-mail de test reel n'est envoye automatiquement.
- La cle publique EmailJS et le modele sont publics : le filtrage navigateur n'est pas une barriere serveur contre une personne appelant directement l'API. Les limites de protection du service restent applicables.
- Documentation officielle : https://www.emailjs.com/docs/user-guide/dynamic-variables-templates/ et https://www.emailjs.com/docs/faq/can-i-send-html-from-my-code/ .

## Recette

Tests unitaires : quote-message-html.test.cjs, contact-emailjs.test.cjs, email-template.test.cjs. Verifier gras/italique/listes, caracteres accentues, texte contenant des balises, un seul tableau, conservation des caracteristiques apres remplacement du texte, repli pour anciens clients.

Recette navigateur : viewer reel, capture perspective, formulaire responsive, conservation des champs en erreur, requetes EmailJS interceptees. Apercu du mail genere dans outputs/email-rich-20261030/. La reception du nouvel HTML doit etre confirmee par un prochain envoi autorise ; la reception du modele precedent est deja documentee.
