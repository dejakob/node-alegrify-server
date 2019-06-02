let bugsnag;
let bugsnagExpress;
let bugsnagClient;

function initLogger(app) {
    try {
        if (process.env.NODE_ENV !== 'production') {
            return false;
        }
        
        bugsnag = require('@bugsnag/js');
        bugsnagExpress = require('@bugsnag/plugin-express');
        bugsnagClient = bugsnag('BUGSNAG_KEY');
        bugsnagClient.use(bugsnagExpress);

        const middleware = bugsnagClient.getPlugin('express');
        
        // This must be the first piece of middleware in the stack.
        // It can only capture errors in downstream middleware
        app.use(middleware.requestHandler);
    }
    catch (ex) {
        console.log('Could not init bugsnag :(');
    }
}

function initLoggerEnd(app) {
    try {
        if (process.env.NODE_ENV !== 'production') {
            return false;
        }

        const middleware = bugsnagClient.getPlugin('express');
        app.use(middleware.errorHandler);
    }
    catch (ex) {
        console.log('Could not init bugsnag :(');
    }
}

function logError(error) {
    try {
        if (process.env.NODE_ENV !== 'production') {
            return console.error(error);
        }

        if (bugsnagClient && typeof bugsnagClient.notify === 'function') {
            bugsnagClient.notify(error);
        }
    }
    catch (ex) {
        console.log('Could not log error :(');
    }
}

module.exports = {
    initLogger,
    initLoggerEnd,
    logError
};