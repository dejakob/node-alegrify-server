const { findInDatabase, findMultipleInDatabase, upsertToDatabase, updateInDatabase, softDeleteInDatabase } = require('../services/database');
const { logError } = require('../services/logger');
const User = require('../helpers/user');

const CONNECTION_TYPES = {
    CONNECT2CLIENT: 'connect2client',
    CONNECT2CONSULT: 'connect2consult',
}

/**
 * Connect API
 * @param {Express} app 
 */
function ConnectApi(app) {
    app.post('/api/connect/to/client', connectToClient);
    app.post('/api/connect/to/consult', connectToConsult);
    app.post('/api/connect/approve', approveConnection);
    app.post('/api/connect/decline', declineConnection);
    app.delete('/api/connect/from/client', disconnectFromClient);
    app.delete('/api/connect/from/consult', disconnectFromConsult);
    app.delete('/api/connect/:proposalId', cancelProposal);

    /**
     * Connect consult to client
     * @param {Object} request 
     * @param {Object} response 
     */
    async function connectToClient(request, response) {
        try {
            const myUserId = request.user.userId;

            // Only allow connect2client for consult
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true }
            );

            if (!myUser) {
                return response.sendStatus(403);
            }

            const client = await findInDatabase(
                'User',
                { email: request.body.email }
            )

            if (client.is_consult) {
                return response.sendStatus(403);
            }

            await upsertToDatabase(
                'ConnectionProposal',
                { from: myUserId, to: client._id, type: CONNECTION_TYPES.CONNECT2CLIENT },
                { from: myUserId, to: client._id, type: CONNECTION_TYPES.CONNECT2CLIENT }
            );

            return response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Connect client to consult
     * @param {Object} request 
     * @param {Object} response 
     */
    async function connectToConsult(request, response) {
        try {
            const myUserId = request.user.userId;

            const consult = await findInDatabase(
                'User',
                { email: request.body.email, is_consult: true }
            );

            await upsertToDatabase(
                'ConnectionProposal',
                { from: myUserId, to: consult._id, type: CONNECTION_TYPES.CONNECT2CONSULT },
                { from: myUserId, to: consult._id, type: CONNECTION_TYPES.CONNECT2CONSULT }
            );

            return response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Approve connection
     * @param {Object} request 
     * @param {Object} response 
     */
    async function approveConnection(request, response) {
        try {
            const myUserId = request.user.userId;
            const { connectionProposalId } = request.body;
            let me;
            let clients;

            const connectionProposal = await findInDatabase(
                'ConnectionProposal',
                { _id: connectionProposalId }
            );

            // Check if you can approve connection
            if (connectionProposal.to !== myUserId) {
                return response.sendStatus(403);
            }

            // Add client
            switch (connectionProposal.type) {
                
                // In case of CONNECT2CLIENT, add me as client to from
                case CONNECTION_TYPES.CONNECT2CLIENT:
                    me = await findInDatabase('User', { _id: connectionProposal.from });
                    clients = (me.clients || []).filter((client, index) => me.clients.indexOf(client) === index);
                    clients.push(myUserId);
                    await updateInDatabase('User', connectionProposal.from, { clients });

                    const myConsults = (await findInDatabase('User', { _id: myUserId })).consults || [];
                    if (myConsults.indexOf(connectionProposal.from) === -1) {
                        myConsults.push(connectionProposal.from);
                        await updateInDatabase('User', myUserId, { consults: myConsults });
                    }
                break;

                // In case of CONNECT2CONSULT, add from as client to me
                case CONNECTION_TYPES.CONNECT2CONSULT:
                    me = await findInDatabase('User', { _id: myUserId });
                    clients = (me.clients || []).filter((client, index) => me.clients.findIndex(client) === index);
                    clients.push(connectionProposal.from);
                    await updateInDatabase('User', myUserId, { clients });

                    const consultsClient = (await findInDatabase('User', { _id: connectionProposal.from })).consults || [];
                    if (consultsClient.indexOf(myUserId) === -1) {
                        consultsClient.push(myUserId);
                        await updateInDatabase('User', connectionProposal.from, { consults: consultsClient });
                    }
                break;
            }

            // Remove proposal
            await softDeleteInDatabase('ConnectionProposal', connectionProposalId);
            response.status(200).json({ user: User.outputToClient(connectionProposal.from) });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Decline connection proposal
     * @param {Object} request 
     * @param {Object} response 
     */
    async function declineConnection(request, response) {
        try {
            const myUserId = request.user.userId;
            const { connectionProposalId } = request.body;

            const connectionProposal = await findInDatabase(
                'ConnectionProposal',
                { _id: connectionProposalId }
            );

            // Check if you can approve connection
            if (connectionProposal.to !== myUserId) {
                return response.sendStatus(403);
            }

            // Remove proposal
            await softDeleteInDatabase('ConnectionProposal', connectionProposalId);
            response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Disconnect from one of your clients (as a consult)
     * @param {Object} request 
     * @param {Object} response 
     */
    async function disconnectFromClient(request, response) {
        try {
            const myUserId = request.user.userId;
            const me = await findInDatabase('User', { _id: myUserId });
            const client = await findInDatabase('User', { _id: request.body.userId });

            // Todo remove consult on client
            const clients = (me.clients || []).filter(client => client !== request.body.userId);
            const consults = (client.consults || []).filter(consult => consult !== myUserId);

            await updateInDatabase('User', myUserId, { clients });
            await updateInDatabase('User', request.body.userId, { consults });

            response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Disconnect from one of your consults (as a client)
     * @param {Object} request 
     * @param {Object} response 
     */
    async function disconnectFromConsult(request, response) {
        try {
            const myUserId = request.user.userId;
            const consultIWantToDisconnectFrom = await findInDatabase('User', { _id: request.body.userId });
            const me = await findInDatabase('User', { _id: myUserId });

            const clients = (consultIWantToDisconnectFrom.clients || []).filter(client => client !== myUserId);
            const consults = (me.consults || []).filter(consult => consult !== request.body.userId); 

            await updateInDatabase('User', consultIWantToDisconnectFrom._id, { clients });
            await updateInDatabase('User', myUserId, { consults });

            response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Cancel a proposal (before it got accepted)
     * @param {Object} request
     * @param {Object} response
     */
    async function cancelProposal(request, response) {
        try {
            const { proposalId } = request.params;

            await softDeleteInDatabase('ConnectionProposal', proposalId);

            response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

ConnectApi.CONNECTION_TYPES = CONNECTION_TYPES;

module.exports = ConnectApi;