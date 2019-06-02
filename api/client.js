const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');
const cuid = require('cuid');
const User = require('./user');
const Connect = require('./connect');
const { CONNECTION_TYPES } = Connect;

/**
 * User API
 * @param {Express} app
 */
function ClientApi(app) {
    app.get('/api/clients', getClients);

    /**
     * @async
     * Get all clients of consultant
     * @param {Object} request
     * @param {Object} response
     */
    async function getClients(request, response) {
        try {
            const myUserId = request.user.userId;
            const user = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true },
                { populate: { clients: 'User' } }
            );
            const clients = (user.clients || []).map(User.outputToConsult);


            const mapConnectionToPendingUser = connection => ({
                _id: connection._id,
                pending: true,
                pendingType: connection.type,
                userId: connection.type === CONNECTION_TYPES.CONNECT2CLIENT ? connection.to : connection.from,
            });
            const pendingConnectionsFromMe = (await findMultipleInDatabase(
                'ConnectionProposal',
                { from: myUserId, type: CONNECTION_TYPES.CONNECT2CLIENT }
            )).map(mapConnectionToPendingUser);
            const pendingConnectionsToMe = (await findMultipleInDatabase(
                'ConnectionProposal',
                { to: myUserId, type: CONNECTION_TYPES.CONNECT2CONSULT }
            )).map(mapConnectionToPendingUser);

            const allPendingConnections = [...pendingConnectionsFromMe, ...pendingConnectionsToMe];

            let index = 0;
            for (let pendingConnection of allPendingConnections) {
                try {
                    const email = (await findInDatabase('User', { _id: pendingConnection.userId })).email;
                    allPendingConnections[index].email = email;
                    delete allPendingConnections[index].userId;
                    index++;
                }
                catch (ex) {}
            }

            return response
                .status(200)
                .json({ clients: [...clients, ...allPendingConnections] });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = ClientApi;
