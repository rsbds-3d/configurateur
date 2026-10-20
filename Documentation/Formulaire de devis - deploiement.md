# Formulaire de devis Rosebuds

Version : v0.11-260930. Implementation du 16 octobre 2026.

## Etat et limites

MISE A JOUR DU 20 OCTOBRE : l'utilisateur a choisi FormSubmit sans pieces jointes, avec lien viewer public. Voir [Activation FormSubmit](Activation%20FormSubmit.md), qui decrit le mode actif et ses limites. Les sections ci-dessous restent la documentation du backend alternatif Resend non active. L'activation FormSubmit par e-mail et la reception finale ne sont pas verifiees ; aucun test reel envoye par Codex.

Le formulaire et son raccordement au viewer sont implementes. Le backend est fourni, mais aucun compte de messagerie, domaine d'expedition, scanner ni hebergement API n'a ete configure : l'envoi reel est desactive. Aucun e-mail de test n'a ete envoye. La fonctionnalite ne doit pas etre declaree pleinement operationnelle avant le test autorise de reception dans info@rosebuds.net.

Le site public est heberge sur GitHub Pages, et l'application Windows utilise un serveur de fichiers local. Ces deux serveurs ne peuvent pas envoyer des e-mails de facon securisee sans backend supplementaire. Le meme backend HTTPS peut desservir les deux versions.

## Parcours et donnees

Correction du 20 octobre 2026 : le lien « Configuration sur mesure » du panneau produit ouvre egalement la modale integree, sans navigation externe. Les liens des produits standard continuent a ouvrir leur page Rosebuds. Les deux entrees utilisent le meme gestionnaire et la configuration courante. Cette correction n'active pas l'envoi d'e-mails.

Bouton du viewer « Demander un devis pour cette configuration » : ouverture d'une modale, capture PNG filigranee, recapitulatif et message modifiable. Les coordonnees et le message restent en memoire apres fermeture ou erreur. Aucune inscription newsletter n'est effectuee. Le viewer et ses parametres ne sont pas modifies.

La reference de configuration est un UUID prefixe RB-. Les champs disponibles proviennent de currentViewerConfiguration. Les dimensions manquantes ne sont pas inventees. Les choix du navigateur constituent une demande declaree par le client, pas une validation de faisabilite ni de prix.

Capture : PNG reduit a 1400 pixels sur son plus grand cote, limite 4 Mo. Document facultatif : PNG, JPEG ou PDF, 2 Mo. Le serveur verifie tailles, extension, signature binaire, encodage, et refuse les PDF avec instructions actives detectables. Un scanner antivirus externe est obligatoire pour activer le service ; ces controles ne remplacent pas l'analyse antivirus.

## Design observe

Analyse du HTML et des styles calcules de https://rosebuds.net/fr/nous-contacter dans Chrome : titre 36 px, couleur #38383B ; labels/champs #5D5D5D ; bordures 1 px #C7C7C7 ; bouton #38383B et accent #FE3A9E. La famille du site est declaree « ts », le bouton « roboto ». Les fichiers de ces polices ne sont pas copies : la modale emploie la police sans-serif existante, avec le logo Rosebuds du projet. La presentation est adaptee en deux colonnes bureau et une colonne mobile. L'identite visuelle est rapprochee, pas declaree identique pixel par pixel.

Politique de confidentialite verifiee dans le HTML officiel : https://rosebuds.net/fr/content/28-confidentialite.

## Architecture

- assets/js/contact-model.js : champs disponibles et generation du message.
- assets/js/contact-form.js : modale, capture, pieces jointes, validation native, anti-doublon et etats d'envoi.
- assets/data/contact-config.json : URL publique de l'API, jamais de secret.
- server/contact-service.mjs : validation, Resend, protection Turnstile, antivirus, SQLite et webhook signe.
- server/start.mjs : serveur HTTP reserve au reverse proxy.
- server/.env.example : variables a remplir sur le serveur uniquement.

Destinataire fixe cote serveur : **info@rosebuds.net**. Aucun champ To, CC ou BCC du navigateur n'est utilise. From vient de CONTACT_FROM, sur un domaine autorise et verifie. Reply-To est l'adresse validee du client. L'objet serveur contient la reference RB-. La version HTML comprend l'apercu integre par CID, le tableau, le message echappe et la liste des documents ; une version texte accompagne le HTML.

## Deploiement du backend

1. Choisir un serveur Node.js 24 ou superieur avec disque persistant, accessible en HTTPS derriere un reverse proxy. Ne pas servir le dossier server comme un repertoire public.
2. Installer le dossier server et assets/js/contact-model.js en conservant leurs chemins relatifs. Aucune dependance npm tierce n'est requise. SQLite natif Node est utilise ; verifier sa disponibilite avec la version Node retenue.
3. Creer le repertoire prive de donnees, restreindre ses permissions au compte du service. Copier server/.env.example vers server/.env sur le serveur et remplir les valeurs. Ne jamais versionner ce fichier.
4. Demarrer depuis server avec `node --env-file=.env start.mjs`. En production, utiliser un gestionnaire de service avec redemarrage et des permissions minimales.
5. Configurer le reverse proxy HTTPS vers le port 8787 local : corps maximal 9 Mo, delai de reponse au moins 70 secondes, limitation de debit et de connexions. Le port Node ne doit pas etre publiquement accessible directement.
6. Modifier assets/data/contact-config.json : apiBase vaut `https://VOTRE-HOTE-API/api` (remplacer par l'hebergement reel). Reconstruire/publier le site et l'installateur. Une valeur vide garde l'envoi desactive et affiche les solutions de repli.

Routes : GET /api/config, POST /api/contact, POST /api/webhooks/resend. Ne pas ajouter de route acceptant un destinataire libre.

### Variables serveur

| Variable | Usage |
|---|---|
| RESEND_API_KEY | Cle privee Resend avec droit d'envoi minimal |
| CONTACT_FROM | Expediteur sur domaine verifie et autorise ; jamais l'adresse du client |
| CONTACT_ALLOWED_ORIGINS | Origines exactes separees par virgule : site Pages et localhost:8080 si bureau utilise |
| CONTACT_RATE_SECRET | Secret aleatoire de 32 caracteres minimum, utilise pour les empreintes et les limites IP |
| CONTACT_DATABASE | Chemin absolu du fichier SQLite prive et persistant |
| TURNSTILE_SITE_KEY | Cle publique du widget configure pour les domaines utilises |
| TURNSTILE_SECRET_KEY | Secret prive de validation serveur Turnstile |
| RESEND_WEBHOOK_SECRET | Secret de signature du webhook Resend |
| AV_SCAN_URL | Endpoint prive de scanner, POST binaire, reponse JSON `{"clean":true}` uniquement si analyse saine |
| AV_SCAN_TOKEN | Jeton prive optionnel du scanner, transmis en Bearer |
| CONTACT_TRUST_PROXY | 0 par defaut ; mettre 1 seulement si le serveur est isole derriere un proxy qui ecrase X-Forwarded-For |
| HOST / PORT | Ecoute locale, par defaut 127.0.0.1:8787 |

Le scanner peut etre un service interne adosse a ClamAV avec signatures maintenues ; cet adaptateur n'est pas fourni et doit etre configure par l'hebergeur. L'analyse doit refuser en cas de panne, pas renvoyer clean par defaut.

Le service refuse l'envoi tant que les variables requises ne sont pas remplies. Le navigateur recupere seulement ready et la cle publique Turnstile. Il n'obtient jamais les secrets.

## Anti-spam et doublons

Turnstile est valide cote serveur, avec hostname et action rosebuds_quote. Honeypot et delai minimal de saisie completent le controle. Une limite d'entree de 30 requetes par minute protege le traitement avant validation des fichiers ; la limite persistante des demandes validees est de cinq tentatives par heure et par empreinte IP. Origines explicitement autorisees ; aucun joker CORS.

SQLite conserve les empreintes, references, identifiants prestataire et statuts, pas les messages ni les pieces jointes. Les demandes concurrentes sont verrouillees ; la cle d'idempotence est aussi transmise a Resend. En cas de timeout, la meme demande est retentee avec la meme cle. Au-dela de 23 heures, une demande incertaine doit etre verifiee avant reenvoi pour ne pas depasser la duree d'idempotence du prestataire.

Purge des traces de demandes/evenements apres 30 jours lors des appels de contact ; limites IP expirees purgees egalement. En faible trafic, programmer une purge equivalente cote exploitation. Limiter la retention et l'acces des journaux du proxy/prestataire/scanner. Les journaux applicatifs ne contiennent ni adresse client, ni message, ni fichier. Prevoir sauvegarde/restriction du disque et contrats de sous-traitance appropries avec les prestataires retenus.

## Delivrabilite et suivi

Faire autoriser et verifier le domaine d'expedition par son proprietaire. Installer les enregistrements SPF et DKIM exacts fournis par Resend, puis definir DMARC avec l'administrateur du domaine sans casser les enregistrements existants. Ne pas usurper rosebuds.net et ne pas utiliser le domaine de l'utilisateur sans accord.

Configurer le webhook HTTPS /api/webhooks/resend pour email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained et email.failed. La signature Svix est verifiee sur le corps brut avec tolerance de cinq minutes et deduplication de l'identifiant d'evenement. Les statuts sont conserves en SQLite et les rejets/rebonds sont journalises par identifiant prestataire. Connecter ces evenements a une supervision d'exploitation.

Une reponse accepted signifie uniquement que Resend a pris en charge l'envoi. Un evenement delivered ne prouve pas a lui seul l'arrivee dans la boite de reception plutot que dans les indésirables. Le formulaire ne pretend pas confirmer cette reception finale.

## Test autorise obligatoire avant activation publique

Ne pas envoyer de test reel sans autorisation explicite. Obtenir un acces autorise a la boite info@rosebuds.net ou une personne habilitee qui confirme la reception.

1. Verifier domaine, DNS, adresse From, origine, Turnstile et scanner en environnement de recette.
2. Obtenir l'accord d'envoyer un test vers info@rosebuds.net.
3. Envoyer une configuration connue avec un PNG et un document sain ; relever la reference RB- et l'identifiant Resend.
4. Dans la boite destinataire, verifier reception/indesirables, objet, accents, caracteristiques, image integree et pieces jointes.
5. Cliquer sur Repondre et verifier que le destinataire est l'adresse du client de test.
6. Verifier les resultats SPF/DKIM/DMARC dans les en-tetes et le suivi webhook. Tester rejet/erreur via les moyens de recette du prestataire, sans messages abusifs.
7. Archiver seulement le resultat de validation et les references necessaires. Tant que cette procedure n'est pas faite, conserver la mention « reception finale non verifiee ».

## Verification executee pendant le developpement

Tests unitaires : destinataire fixe, Reply-To, HTML echappe, PJ, idempotence sequentielle/concurrente, erreurs prestataire, scanner, limite de debit et signature webhook. Tests Chrome : ouverture depuis viewer, vraie capture PNG, donnees de configuration, fichier additionnel, reouverture sans perte des champs, erreur puis acceptation simulee, mobile et mode non configure. Tous les prestataires sont simules : aucun e-mail reel n'a ete transmis.

## Sources techniques

- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/changelog/embed-images-using-cid
- https://resend.com/changelog/managing-webhooks-via-api
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
