console.log('UPLOADING JS/CSS TO GOOGLE CLOUD')

const ls = require('ls');
const path = require('path');

const PROJECT_ID = 'alegrify';
const BUCKET_NAME = 'alegrify';

const GoogleCloud = require('@google-cloud/storage');

const storage = new GoogleCloud.Storage({
    projectId: PROJECT_ID,
    keyFilename: path.join(__dirname, '../GOOGLE_CLOUD_CONFIG.json')
});
const bucket = storage.bucket(BUCKET_NAME);
const pathStart = path.join(__dirname, '/../');

const appJsFiles = ls(path.join(pathStart, 'node_modules/alegrify-web/build/static/js/*.js'));
const appCssFiles = ls(path.join(pathStart, 'node_modules/alegrify-web/build/static/css/*.css'));

uploadAll();

async function uploadAll() {
    for (let appJsFile of appJsFiles) {
        const appJs = appJsFile.file;
    
        await new Promise((resolve, reject) => {
            const fullPathJs = path.join(pathStart, `node_modules/alegrify-web/build/static/js/${appJs}`);
            bucket.upload(fullPathJs, { destination: `js/${appJs}` }, (err, file) => {
                if (err) { throw new Error('COULD NOT UPLOAD JS') }
                else {
                    file.makePublic()
                    console.log('make file public', file.name);
                    return resolve(); 
                }
            });
        });
    }
    
    for (let appCssFile of appCssFiles) {
        const appCss = appCssFile.file;
    
        await new Promise((resolve, reject) => {
            const fullPathCss = path.join(pathStart, `node_modules/alegrify-web/build/static/css/${appCss}`);
            bucket.upload(fullPathCss, { destination: `css/${appCss}` }, (err, file) => {
                if (err) { throw new Error('COULD NOT UPLOAD CSS') }
                else {
                    file.makePublic();
                    console.log('make file public', file.name);
                    return resolve();
                }
            });
        });
    }
}


