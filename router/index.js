const jwt = require('jsonwebtoken');
const { EXPRESS_SECRET } = require('../config.json');
const path = require('path');

const fs = require('fs');
const ls = require('ls');
const request = require('request');
const { renderToString } = require('react-dom/server');
const { createAppState } = require('../services/state');
const { saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

const auth = require('basic-auth');
const compare = require('tsscmp');

const Document = require('alegrify-web').default.default;

const appCssFiles = ls(path.join(__dirname, '/../node_modules/alegrify-web/build/static/css/*.*.css'));
let indexPage;

try {
    indexPage = fs.readFileSync(path.join(__dirname, '/../node_modules/alegrify-web/build/index.html')).toString();
}
catch (ex) {}

let cssContent = appCssFiles
    .map(appCss =>
        fs.readFileSync(path.join(__dirname, '/../node_modules/alegrify-web/build/static/css/' + appCss.file)).toString()    
    )
    .join('');
cssContent += ';' + fs.readFileSync(path.join(__dirname, '/../node_modules/alegrify-ui/alegrify-ui.min.css')).toString();


let isInitialized = false;

const BASIC_AUTH_RC_USER = 'BASIC_AUTH_RC_USER';
const BASIC_AUTH_RC_PASS = 'BASIC_AUTH_RC_PASW';

async function getRouter(app) {
    if (!isInitialized) {
        isInitialized = true;

        // All HTML pages
        app.get('/*', async (req, res, next) => {
            if (req.hostname === 'rc.alegrify.com') {
                const credentials = auth(req);

                if (!credentials || !safeBasicAuthCheck(credentials.name, credentials.pass, BASIC_AUTH_RC_USER, BASIC_AUTH_RC_PASS)) {
                    res.statusCode = 401;
                    res.setHeader('WWW-Authenticate', 'Basic realm="Alegrify RC"');
                    return res.end('Access denied');
                }
            }

            if (req.originalUrl.indexOf('/current/static') === 0) {
                return next();
            }

            if (req.originalUrl.indexOf('.js') > -1) {
                return next();
            }

            let stateData = {};
            let stateDataJson = '{}';

            let locale = req.query.locale || req.locale;

            try {
                let userId;

                if (req.cookies && typeof req.cookies.token === 'string' && typeof req.cookies.token.trim() !== '') {
                    try {
                        userId = jwt.verify(req.cookies.token, EXPRESS_SECRET).userId;
                    }
                    catch (ex) {}
                }

                stateData = await createAppState({
                    userId,
                    locals: res.locals,
                    locale,
                    route: req.originalUrl,
                    disableAnalytics: !!req.headers['alegrify-disable-analytics']
                });

                stateData.token = req.cookies.token;

                if (stateData.user && stateData.user.locale) {
                    locale = stateData.user.locale;
                }

                stateData.locale = locale;
            }
            catch (ex) {
                console.log('ex', ex);
            }

            try {
                if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || req.query.ssr) {
                    let App;
                    let title;
                    let description;
                    let sheet;
                    let supportedLanguages = [];

                    const route = req.originalUrl;
                    const document = new Document(route, {
                        setTitle(newTitle) {
                            title = newTitle;
                        },
                        setDescription(newDescription) {
                            description = newDescription;
                        },
                        getExternalStyling() {
                            return cssContent;
                        }
                    });
                    document.injectState(stateData);
                    document.setLanguage(locale);
                    title = document.translate('TITLE');
                    description = document.translate('DESCRIPTION');
                    sheet = document.styleSheet;
                    supportedLanguages = document.translate.supportedLanguages;
                        
                    App = document.component;
                
                    const body = renderToString(App);
                    let cache = [];

                    stateData.routeComponent = document.routeComponent;
                    stateDataJson = JSON.stringify(stateData);

                    await saveToDatabase('PageView', {
                        request_log: JSON.parse(JSON.stringify(req, function(key, value) {
                            if (typeof value === 'object' && value !== null) {
                                if (cache.indexOf(value) !== -1) {
                                    try {
                                        return JSON.parse(JSON.stringify(value));
                                    } catch (error) {
                                        return;
                                    }
                                }
                                cache.push(value);
                            }
                            return value;
                        }))
                    }, { excludeFromIndexes: true });

                    let contentToSend = indexPage
                        .replace('<div id="root"></div>', `
                            <div id="root">${body}</div>
                        `)
                        .replace('<link', `
                            ${sheet.getStyleTags()}
                        <link`)
                        .replace('<title>Alegrify</title>', `
                            <title>${title}</title>
                            <meta property="og:title" content="${title}" />
                        `)
                        .replace('$meta_description', `
                            <meta name="description" content="${description}" />
                            <meta property="og:description" content="${description}" />
                        `)
                        .replace('$meta_image', `
                            <meta property="og:image" content="http://alegrify.com/logo_media.png" />
                            <meta property="og:image:secure_url" content="https://alegrify.com/logo_media.png" />
                            <meta property="og:image:width" content="354" />
                            <meta property="og:image:height" content="354" />
                            <meta property="og:image:type" content="image/png" />
                            <link rel="apple-touch-icon" href="http://alegrify.com/logo_media.png" />
                        `)
                        .replace('$link_alternate',
                            supportedLanguages.map(lang =>
                                `<link rel="alternate" hreflang="${lang}" href="https://alegrify.com${route.split('?')[0]}?locale=${lang}" />`
                            ).join('')
                        )
                        .replace('$server_app_state', stateDataJson)
                        .replace('$logged_in_greeting', document.translate('FB_LOGGED_IN'))
                        .replace('$logged_out_greeting', document.translate('FB_LOGGED_OUT'))
                        .replace(/src=\"\/static/gi, `src="https://storage.googleapis.com/alegrify`)
                        .replace(/href=\"\/static/gi, `href="https://storage.googleapis.com/alegrify`)

                    res.send(contentToSend);
                }
                else {
                    stateDataJson = JSON.stringify(stateData);

                    request('http://localhost:3000', (req, reqres, body) => {
                        const devIndexPage = body;

                        let devContentToSend = devIndexPage
                            .replace('$server_app_state', stateDataJson)
                            .replace('$meta_description', `
                                <meta name="description" content="" />
                                <meta property="og:description " content="" />
                            `)
                            .replace('$link_alternate', '')
                            .replace('$meta_image', `
                                <meta property="og:image" content="" />
                                <link rel="apple-touch-icon" href="" />
                            `)
                            .replace('<title>Alegrify</title>', `
                                <title></title>
                                <meta property="og:title" content="" />
                            `);

                        devContentToSend = devContentToSend
                            .replace(/src=\"\/static/gi, `src="http://localhost:3000/static`);
                        devContentToSend = devContentToSend
                            .replace(/href=\"\/static/gi, `href="http://localhost:3000/static`);

                        res.send(
                            devContentToSend
                        );
                    })
                }
            }
            catch (ex) {
                logError(ex);

                res
                    .status(500)
                    .json({})
            }
        });
        
        app.listen(
            process.env.NODE_ENV === 'test' ?
                4001 :
                process.env.NODE_ENV === 'production' ?
                    8080 :
                    3001,
            () => {}
        );
    }

    return app;
}

function safeBasicAuthCheck(name, pass, intendedName, intendedPass) {
    var valid = true;
    
    // Simple method to prevent short-circut and use timing-safe compare
    valid = compare(name, intendedName) && valid
    valid = compare(pass, intendedPass) && valid
    
    return valid;
}

module.exports = getRouter;