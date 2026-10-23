# Modele HTML de devis Rosebuds

Mise a jour : 23 octobre 2026. Application inchangee : v0.11-260930.

## Etat de la messagerie

- Service EmailJS : `rosebuds_devis`, Gmail dedie `configurateur.rosebuds@gmail.com`.
- Modele : `rosebuds_devis_html`.
- Destinataire principal fixe dans EmailJS : `info@rosebuds.net`.
- Nom d'expediteur : Configurateur Rosebuds. Reply-To : `{{email}}`.
- Autorisation Gmail d'envoi corrigee le 23 octobre, puis test unique autorise : 200 OK.
- Reception confirmee par l'utilisateur et documentee par le PDF du message transfere par Rosebuds.
- Le configurateur est maintenant configure pour EmailJS dans les sources (raccordement du 23 octobre). La confirmation du deploiement est notee dans le journal ; ne pas confondre le test distant precedent avec un nouvel envoi du formulaire.

## Presentation du 23 octobre

Source editable : `assets/email/rosebuds-devis-emailjs.html`.

La charte a ete relevee sur https://rosebuds.net/fr/ : rose #FE3A9E, textes #38383B / #5D5D5D, pied de page #333333, fond blanc et titres serif. Le site utilise une police personnalisee nommee `ts` et des titres serif ; le mail utilise Arial et Georgia en remplacement compatible messageries, sans pretendre embarquer cette police.

Le logo couronne utilise maintenant le fichier Illustrator de reference fourni par l'utilisateur : `C:/Users/charl/Documents/CLIENTS/ROSEBUDS/IMAGES/LOGO/ROSEBUDS_Logo 2017_noir 100_cs6.ai`. Le fichier original reste intact. Export direct du contenu vectoriel PDF-compatible, sans redessin, depuis ArtBox + marge de 2 points : PNG blanc opaque 1002 x 422 px, affiche a 235 px dans le mail. Source d'export : `scripts/export-email-logo.py`. Empreintes et provenance : `assets/brand/rosebuds-logo-2017-email.source.json` (local).

Image publique : https://rsbds-3d.github.io/configurateur/assets/brand/rosebuds-logo-2017-email.png. Seul ce PNG a ete publie, commit `aec6551`, workflow Pages `39937103589` reussi. Le fichier AI de 3 Mo n'a pas ete publie. Aucune substitution du logo global du configurateur. Pas de piece jointe ni d'image base64. Certaines messageries bloquent les images distantes : un texte alternatif reste disponible.

Structure : logo, demande/date/reference, interlocuteur, tableau des huit caracteristiques, lien viewer, message du client et bouton reponse. Pas de fausse image de produit, ni de valeur dimensionnelle inventee. Les dix-huit variables existantes et leur echappement double accolade sont conserves.

Mise en page par tableaux et styles inline pour la messagerie ; adaptation mobile sous 620 px. Le contraste du bouton rose a ete renforce par un libelle sombre. Pas de tracker ni nouvelle dependance.

## Verification

- Test structurel : `node tests/email-template.test.cjs`.
- Verifier dans EmailJS la sauvegarde apres rechargement, le chargement du logo et les apercus desktop/mobile.
- Aucun nouvel e-mail de test n'est autorise automatiquement par une modification de design. Demander une nouvelle autorisation pour une recette sur boite du design revise.
- Le PDF fourni confirme la reception du modele precedent, pas encore celle de ce nouveau design.

Verification realisee le 23 octobre : nouveau contenu distant sauvegarde puis confirme apres rechargement ; logo charge (image source 945 px), destinataire fixe et Reply-To preserves. Apercus desktop et mobile controles ; largeur mobile 306 px, largeur de contenu 306 px, sans debordement horizontal. Captures dans `outputs/emailjs-20261023/`. Test structurel reussi. Aucun nouvel envoi apres changement de design.

## Raccordement du configurateur

Module `assets/js/contact-emailjs.js`, configuration publique `assets/data/contact-config.json`. La cle publique EmailJS n'est pas un secret ; aucune cle privee n'est exposee. Envoi POST JSON au endpoint officiel EmailJS, succes uniquement sur HTTP200 et texte OK. Dix-huit variables echappees par le modele distant. La longueur et le type de bronze eventuels sont aussi conserves dans les notes, ainsi que le sujet et l'avertissement de materiaux multiples. Reference stable pendant la demande. Un timeout signale un resultat incertain, sans reessai automatique.

Le prestataire, son logo ou son HTML ne viennent pas du navigateur : le modele distant fixe le destinataire, l'expediteur et le Reply-To {{email}}. Pas de PJ ni de fausse image produit. Le viewer et le PDF sont accessibles via le lien produit. La modale conserve l'apercu local, les coordonnees et le message en cas d'erreur. Le bloc d'information FormSubmit n'est plus affiche. Aucune activation FormSubmit n'est necessaire pour ce mode.

Tests : `node tests/contact-emailjs.test.cjs`, `node tests/email-template.test.cjs`. Tests API simules exclusivement. Aucun nouveau test reel de cette integration n'a ete envoye.

## Surveillance

Verifier quotas et echecs dans Email History. L'offre gratuite observee est limitee a 200 demandes mensuelles ; cette valeur peut changer. Configurer les domaines autorises si disponible pour cette offre. Les protections navigateur (honeypot/delai/anti-double-clic) ne remplacent pas une protection serveur ou CAPTCHA. En cas d'abus, configurer CAPTCHA EmailJS ou utiliser le backend alternatif. Pour changer de prestataire, modifier explicitement contact-config.json ; aucun repli automatique susceptible de provoquer des doublons.
