const { createAppState } = require('../services/state');
const { logError } = require('../services/logger');

/**
 * State API
 * @param {Express} app 
 */
function StateApi(app) {
    app.get('/api/state/*', getStateForPath);
    app.get('/api/state', getStateForPath);
    
    async function getStateForPath(request, response) {
        try {
            const userId = request.user && request.user.userId;
            const locale = request.query.locale || request.locale;

            const route = request.url.split(/state[\/|]/)[1];

            const state = await createAppState({
                userId,
                locals: response.locals,
                locale,
                route,
                disableAnalytics: !!request.headers['alegrify-disable-analytics'],
                userAgent: request.userAgent
            });

            response
                .status(200)
                .json({ state });
        }
        catch (ex) {
            logError (ex);
            response.sendStatus(500);
        }
    }
}

module.exports = StateApi;