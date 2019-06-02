const ls = require('ls');
const path = require('path');
const express = require('express');
const jwt = require('express-jwt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const locale = require('locale');
const useragent = require('useragent');
const helmet = require('helmet');
const hpp = require('hpp');

const { initLogger, initLoggerEnd, logError } = require('../services/logger');
const { EXPRESS_SECRET } = require('../config.json');

function initBugsnag(app) {
    initLogger(app);
}

function initBugsnagEnd(app) {
    initLoggerEnd(app);
}

/**
 * Cross origin requests (consult etc)
 * @param {Express} app 
 */
function initCors(app) {
    app.use(function(req, res, next) {
        if (process.env.NODE_ENV === 'production') {
            if (
                req.hostname === 'ostrich.alegrify.com' ||
                req.headers.origin === 'https://ostrich.alegrify.com' ||
                req.headers.referer === 'https://ostrich.alegrify.com/'
            ) {
                res.header('Access-Control-Allow-Origin', 'https://ostrich.alegrify.com');
            }
            else {
                res.header('Access-Control-Allow-Origin', 'https://consult.alegrify.com');
            }
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
        }
        else {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
        }
        
        next();
    });      
}


/**
 * Middleware for JWT tokens
 * @param {Express} app 
 */
function initAuthMiddleware(app) {
    const WHITELIST = [
        '/api/auth/register',
        '/api/auth/login',
        '/api/auth/consult-login',
        '/api/auth/consult-register',
        '/api/auth/dashboard-login',
        '/api/auth/preregister',
        '/api/state',
        '/api/state/',
        '/api/state/signup',
        '/api/state/login',
        '/api/state/crisis',
        '/api/ostrich/goal'
    ];

    app.use((req, res, next) => {
        if (WHITELIST.indexOf(req.originalUrl) > -1) {
            return next();
        }

        return jwt({
            secret: EXPRESS_SECRET,
            credentialsRequired: false,
            getToken: function fromHeaderOrQuerystring (req) {
                if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
                    const bearerToken = req.headers.authorization.split(' ')[1];

                    if (bearerToken && bearerToken !== 'null' && bearerToken.length) {
                        return bearerToken;
                    }

                } else if (req.query && req.query.token) {
                    return req.query.token;
                } else if (req.cookies && req.cookies.token) {
                    return req.cookies.token;
                }
                return null;
            }
        })(req, res, next);
    });
}

/**
 * Middleware to parse POST JSON body
 * @param {Express} app 
 */
function initBodyParser(app) {
    app.use(bodyParser.json());
}

function initCookies(app) {
    app.use(cookieParser());
}

/**
 * Middleware to serve static files
 * @param {Express} app
 */
function initStaticFiles(app) {
    app.use('/static', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/static')));
    app.use('/favicon.ico', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/favicon.ico')));
    app.use('/manifest.json', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/manifest.json')));
    app.use('/logo_media.jpg', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/logo_media.jpg')));
    app.use('/logo_media.png', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/logo_media.png')));
    app.use('/service-worker.js', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/service-worker.js')));

    const daPreCacheManifest = ls(path.join(__dirname, '/../node_modules/alegrify-web/build/precache-manifest*.js'))[0].file;
    app.use('/precache-manifest*', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/' + daPreCacheManifest)));
    app.use('/asset-manifest.json', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/asset-manifest.json')));
    app.use('/alegrify-consult-api.js', express.static(path.join(__dirname, '/../node_modules/alegrify-web/build/alegrify-consult-api.js')));
}

/**
 * Ip country middleware
 * @param {Express} app 
 */
function initIpCountry(app) {
    app.use((req, res, next) => {
        try {
            res.locals.ip = req.headers['cf-connecting-ip'] ||
                req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress;
        }
        catch (ex) {
            logError(ex);
        }

        next();
    });

    app.use((req, res, next) => {
        try {
            res.locals = res.locals || {};
            res.locals.country = req.headers['cf-ipcountry'] || 'BE';
        }
        catch (ex) {
            logError(ex);
        }

        next();
    });
}

/**
 * Attach trust level to request
 * @param {Express} app
 */
function initTrustLevel(app) {
    app.use((req, res, next) => {
        const CLOUDFLARE_HEADERS = [
            'cf-visitor',
            'cf-ipcountry',
            'cf-ray',
            'cf-connecting-ip'
        ];

        let trustLevel = CLOUDFLARE_HEADERS
            .map(key => !!req[key] ? 10 : 0)
            .reduce((a,b) => a + b);

        req.trustLevel = trustLevel;

        next();
    })
}

function initFileUpload(app) {
    app.use(fileUpload());
}

function initLocale(app) {
    app.use(locale(['en', 'en_US', 'nl']));
}

function initUserAgentParse(app) {
    app.use((req, res, next) => {
        try {
            const lookup = useragent.lookup(req.headers['user-agent']) || {};
            const is = useragent.is(req.headers['user-agent']) || {};
            const device = lookup.device || 'unknown';
            const family = typeof device.family === 'string' ? device.family.toLowerCase() : 'unknown';

            let appType = 'web';
            let platformVersion = {
                major: lookup.major || 1,
                minor: lookup.minor || 0,
                patch: lookup.patch || 0
            }
            let appVersion = {
                major: 1, minor: 0, patch: 0
            };
            
            // Legacy
            if (lookup.family && ['AlegrifyNative', 'okhttp'].indexOf(lookup.family) > -1) {
                if (family && family.indexOf('ios') > -1) {
                    appType = 'ios';
                }
                else {
                    appType = 'android';
                }
            }

            // Specific headers
            if (typeof req.headers['alegrify-platform'] === 'string') {
                appType = req.headers['alegrify-platform'].toLowerCase();
            }
            if (typeof req.headers['alegrify-platform-version'] === 'string') {
                try {
                    const [
                        platformVersionMajor,
                        platformVersionMinor,
                        platformVersionPatch
                    ] = req.headers['alegrify-platform-version'].split('.');

                    platformVersion.major = isNaN(platformVersionMajor * 1) ? 1 : platformVersionMajor * 1;
                    platformVersion.minor = isNaN(platformVersionMinor * 1) ? 0 : platformVersionMinor * 1;
                    platformVersion.patch = isNaN(platformVersionPatch * 1) ? 0 : platformVersionPatch * 1;
                } catch (ex) {}
            }
            if (typeof req.headers['alegrify-app-version'] === 'string') {
                try {
                    const [
                        appVersionMajor,
                        appVersionMinor,
                        appVersionPatch
                    ] = req.headers['alegrify-app-version'].split('.');

                    appVersion.major = isNaN(appVersionMajor * 1) ? 1 : appVersionMajor * 1;
                    appVersion.minor = isNaN(appVersionMinor * 1) ? 0 : appVersionMinor * 1;
                    appVersion.patch = isNaN(appVersionPatch * 1) ? 0 : appVersionPatch * 1;
                } catch (ex) {}
            }
    
            const ua = {
                app: appType,
                appVersion: appVersion,
                version: platformVersion,

                isWebkit: !!is.webkit,
                isOpera: !!is.opera,
                isIe: !!is.ie,
                isChrome: !!is.chrome,
                isSafari: !!is.safari,
                isMobileSafari: !!is.mobile_safari,
                isFirefox: !!is.firefox,
                isMozilla: !!is.mozilla,
                isAndroid: !!is.android,
            };

            req.userAgent = ua;
        }
        catch (ex) {
            req.userAgent = {
                app: 'unknown',
                appVersion: {
                    major: 1,
                    minor: 0,
                    patch: 0
                },
                version: {
                    major: 0,
                    minor: 0,
                    patch: 0
                },

                isWebkit: false,
                isOpera: false,
                isIe: false,
                isChrome: false,
                isSafari: false,
                isMobileSafari: false,
                isFirefox: false,
                isMozilla: false,
                isAndroid: false
            };
        }

        next();
    });
}

/**
 * Set some headers for security purposes
 */
function initHelmetSec(app) {
    app.use(helmet());
}

function initHppSec(app) {
    app.use(hpp());
}

module.exports = [
    initBugsnag,
    initCors,
    initAuthMiddleware,
    initBodyParser,
    initCookies,
    initStaticFiles,
    initIpCountry,
    initTrustLevel,
    initFileUpload,
    initLocale,
    initUserAgentParse,
    initHelmetSec,
    initHppSec,
    initBugsnagEnd
];
