const { findInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

/**
 * Module API
 * @param {Express} app 
 */
function ModuleApi(app) {
    app.get('/api/modules', getModulesForCurrentUser);

    // Consult api
    app.get('/api/modules/:id', getModulesForUser);
    app.post('/api/modules/:id', postModulesForUser);

    /**
     * Get list of modules for current user
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function getModulesForCurrentUser(request, response) {
        const myUserId =  request.user.userId;

        try {
            const modules = await findInDatabase('UserModulesHistory', { user_id: myUserId });

            return response
                .status(200)
                .json({ modules });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Get modules for a specific user
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function getModulesForUser(request, response) {
        const userIdToFetch = request.params.id;
        const myUserId =  request.user.userId;

        try {
            // Check if consultant has acess to user data
            const user = await findInDatabase('User', { _id: myUserId, clients: userIdToFetch });

            if (!user || user._id !== userIdToFetch) {

                // If not => 403 Forbidden
                return response
                    .status(409)
                    .json({ user: 'User is not a client or does not exist' });
            }

            // Get clients modules
            const item = await findInDatabase('UserModulesHistory', { user_id: userIdToFetch });

            response
                .status(200)
                .json(item);
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Update modules for a specific user
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function postModulesForUser(request, response) {
        const userIdToPost = request.params.id;
        const { modules } = request.body;
        const myUserId =  request.user.userId;

        try {
            // Check if consultant has acess to user data
            const user = await findInDatabase('User', { _id: myUserId, clients: userIdToPost });

            if (!user || user._id !== userIdToPost) {

                // If not => 403 Forbidden
                return response
                    .status(409)
                    .json({ user: 'User is not a client or does not exist' });
            }

            // Save modules, created_by is logged in user
            const itemId = await saveToDatabase('UserModulesHistory', { user_id: userIdToPost, modules, updated_by: myUserId });

            if (!itemId) {
                return response.sendStatus(500);
            }

            response
                .sendStatus(200);
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = ModuleApi;
