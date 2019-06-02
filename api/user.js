const { updateInDatabase } = require('../services/database');
const { logError } = require('../services/logger');
const Storage = require('../services/storage');

const {
    FIELDS_THAT_CAN_BE_UPDATED_BY_USER,
 } = require('../config.json').USER_DATA_RULES;

const {
    outputToSelf,
    outputToClient,
    outputToConsult,
    outputToCorporate
} = require('../helpers/user');

/**
 * UserStatus API
 * @param {Express} app 
 */
function User(app) {
    app.patch('/api/user', updateUserInfo);
    app.post('/api/user/avatar', updateAvatar);

    async function updateUserInfo(request, response) {
        try {
            const userId = request.user.userId;
            const update = {};

            FIELDS_THAT_CAN_BE_UPDATED_BY_USER.forEach(field => {
                if (request.body[field]) {
                    update[field] = request.body[field];
                }
            });

            const updatedUser = outputToSelf(await updateInDatabase('User', userId, update));

            return response
                .status(200)
                .json({ user: updatedUser });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    async function updateAvatar(request, response) {
        try {
            const { userId } = request.user;
            const fileName = `avatar_${userId}_${Date.now()}_${Math.random() * 9999999}`;
            const mimeType = request.files.avatar.mimetype;
            const data = request.files.avatar.data;

            const avatar = await Storage.uploadFile(fileName, mimeType, data);
            await updateInDatabase('User', userId, { avatar });

            response.status(200).send({ avatar });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

User.outputToSelf = outputToSelf;
User.outputToClient = outputToClient;
User.outputToConsult = outputToConsult;
User.outputToCorporate = outputToCorporate;

module.exports = User;
