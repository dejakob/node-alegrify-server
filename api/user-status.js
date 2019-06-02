const { findInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

/**
 * UserStatus API
 * @param {Express} app 
 */
function UserStatusApi(app) {
    app.post('/api/user-status', postUserStatus);
    
    /**
     * Post user status
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function postUserStatus(request, response) {
        const { status_input_text } = request.body;
        const userId = request.user.userId;

        if (typeof status_input_text !== 'string' || status_input_text.trim() === '') {
            return response
                .status(409)
                .json({ text: 'Should be a string with at least one character' });
        }

        try {
            const statusId = await saveToDatabase('UserStatus', { user_id: userId, text: status_input_text });

            response
                .status(200)
                .json({ statusId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = UserStatusApi;