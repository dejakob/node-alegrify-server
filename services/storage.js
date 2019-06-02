const path = require('path');
const stream = require('stream');
const sharp = require('sharp');

const MIME_TYPE_TO_EXT = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/bmp': '.bmp'
};

const PUBLIC_PATH = 'https://storage.googleapis.com';
const PROJECT_ID = 'alegrify';
const BUCKET_NAME = 'alegrify';

let _bucket;
let _storage;

class Storage {
    static _init() {
        const GoogleCloud = require('@google-cloud/storage');

        _storage = new GoogleCloud.Storage({
            projectId: PROJECT_ID,
            keyFilename: path.join(__dirname, '../GOOGLE_CLOUD.json')
        });
        _bucket = _storage.bucket(BUCKET_NAME);
    }

    /**
     * @async
     * Upload file to cloud storage
     * @param {String} fileName 
     * @param {String} mimeType 
     * @param {Buffer} data 
     */
    static async uploadFile(fileName, mimeType, data) {
        const SIZES = [
            { height: 50, width: 50 },
            { height: 60, width: 60 },
            { height: 100, width: 100 },
            { height: 120, width: 120 },
            { height: 150, width: 150 },
            { height: 160, width: 160 },
            { height: 200, width: 200 },
            { height: 240, width: 240 },
            { height: 250, width: 250 },
            { height: 300, width: 300 },
            { height: 320, width: 320 },
            { height: 400, width: 400 },
            { height: 480, width: 480 },
            { height: 500, width: 500 },
            { height: 600, width: 600 },
            { height: 640, width: 640 },
            { height: 800, width: 800 },
            { height: 960, width: 960 },
            { height: 1000, width: 1000 },
            { height: 1200 },
            { width: 1200 },
        ]

        const ext = MIME_TYPE_TO_EXT[mimeType] || '';

        const bufferStream = new stream.PassThrough();
        bufferStream.end(data);
        const inputBuffers = [
            { buff: bufferStream, suffix: '$SIZE' }
        ];

        for (let size of SIZES) {
            const buff = await (sharp(data)
                .resize(Object.assign({}, size, { fit: 'cover' }))
                .toBuffer());
            const buffStream = new stream.PassThrough();
            buffStream.end(buff);
            inputBuffers.push({ buff: buffStream, suffix: `${size.width || '_'}x${size.height || '_'}` });
        }

        const fileNames = [];

        for (let inputBuffer of inputBuffers) {
            const fullFileName = `${fileName}${inputBuffer.suffix}${ext}`;
            const file = _bucket.file(fullFileName);
            const writeStream = file.createWriteStream({
                metadata: {
                    contentType: mimeType
                }
            });
    
            await new Promise((resolve, reject) => {
                inputBuffer.buff
                    .pipe(writeStream)
                    .on('error', reject);
    
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);            
            });

            await file.makePublic();
            fileNames.push(file.name);
        }

        return `${PUBLIC_PATH}/${BUCKET_NAME}/${fileNames[0]}`;
    }
}

Storage._init();

module.exports = Storage;
