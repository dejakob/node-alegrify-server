const { findInDatabase, upsertToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

/**
 * API for consult notes
 * @param {Express} app 
 */
function ConsultNote(app) {
    app.get('/api/consult/notes/:userId', getConsultNotesAboutClient);
    app.patch('/api/consult/notes/:userId', patchConsultNotesAboutClient);

    /**
     * Get consult notes about client
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function getConsultNotesAboutClient(request, response) {
        try {
            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true }
            );

            const userWeNeedNotesAbout = request.params.userId;

            if (!myUser) {
                return response.sendStatus(403);
            }

            const myClientsIds = myUser.clients;

            // Check if userId is client of current user.
            if (
                !myClientsIds ||
                !myClientsIds.length ||
                myClientsIds.indexOf(userWeNeedNotesAbout) === -1
            ) {
                return response.sendStatus(403);
            }

            const notes = await findInDatabase(
                'ConsultNote',
                { consult_id: myUserId, client_id: userWeNeedNotesAbout }
            );

            return response
                .status(200)
                .json(notes);
        }
        catch (ex) {
            logError(ex);
            return response.sendStatus(500);
        }
    }

    /**
     * Update consult notes about client
     * @param {Object} request 
     * @param {Object} response 
     */
    async function patchConsultNotesAboutClient(request, response) {
        try {
            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true }
            );

            const userWeNeedNotesAbout = request.params.userId;

            if (!myUser) {
                return response.sendStatus(403);
            }

            const myClientsIds = myUser.clients;

            // Check if userId is client of current user.
            if (
                !myClientsIds ||
                !myClientsIds.length ||
                myClientsIds.indexOf(userWeNeedNotesAbout) === -1
            ) {
                return response.sendStatus(403);
            }

            if (!request.body || !request.body.notes) {
                return response.sendStatus(409);
            }

            const result = await upsertToDatabase(
                'ConsultNote',
                { consult_id: myUserId, client_id: userWeNeedNotesAbout },                
                { consult_id: myUserId, client_id: userWeNeedNotesAbout, content: request.body.notes },                
            );
            return response
                .status(200)
                .json(result);
        }
        catch (ex) {
            logError(ex);
            return response.sendStatus(500);
        }
    }
}

module.exports = ConsultNote;