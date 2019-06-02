#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
git clean -fd
git reset --hard origin/master
git checkout master
git pull origin master
rm -rf build
nvm use 10.14.2
nvm alias default 10.14.2
yarn
node ./cli/gcloud-bundle.js
sudo cp ./server_config/alegrify_node.service /lib/systemd/system/alegrify_node.service
sudo systemctl daemon-reload
sudo systemctl restart alegrify_node
sudo systemctl enable alegrify_node