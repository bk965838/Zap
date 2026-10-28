#!/bin/bash
# Vérifie les chaînes depuis votre connexion, puis met le site à jour.
# Usage : bash maj.sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js manquant : installez-le avec  brew install node"; exit 1; }
node tools/check.js
git add channels.json
if git diff --cached --quiet; then echo "Aucun changement."; exit 0; fi
git commit -m "Liste de chaînes vérifiée"
git pull --rebase -q || true
git push
echo "Terminé : le site se met à jour dans 1 à 2 minutes."
