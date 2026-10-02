# Continuation du configurateur Rosebuds

Historique utile : catalogue Originale/NEW SMALL/NEW MEDIUM, tailles de plug et cristal distinctes, disponibilites metier, import des 37 Rhino optimises, decalcomanie persistante et deplacement sur surface, comparaison des tailles et objets GLB, AR camera, capture PNG filigranee, publication GitHub Pages et EXE Windows.

Demandes recentes : login autonome en amont ; bronzes Keyring montes sur les corps avec tete, echelle identique aux pierres principales ; finitions Gold/Silver/Shiny/Patine ; logo blanc sur alu et marron dore sur inox ; rendu metal lisse ; calcul optique non bloquant, annulable et cache persistant ; Chrome en mode application et icone ROSEBUDS.

Etat au 2 octobre : code v0.11-260930 modifie, 37 tests passes avant la derniere regression de lien bronze. Controle visuel inox MEDIUM et Keyring : anisotropie sans tangentes causait les reflets blancs ; desactivation et OutputPass corrigent le rendu. Parcours Gold -> MEDIUM -> Inox -> miroir conserve Gold. Keyring extrait dans un seul fichier partage de 28,7 Mo, utilise par 14 variantes avec tete. BVH en worker avec IndexedDB, annulation lors du retour catalogue. Cache GPU non garanti par l'application.

Lanceur compile, premier Inno compile mais doit etre regenere apres les derniers changements. Pas encore reinstalle ni publie dans cette continuation. Ne pas annoncer livraison complete.

Limites historiques : vraie generation ComfyUI non integree ; modeles IA telecharges et caches, non tous embarques ; authentification Pages cote client ne protege pas les ressources publiques ; AR physique non teste.
