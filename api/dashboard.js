const util = require('util');
const moment = require('moment');
const externalRequest = util.promisify(require('request'));
const Analytics = require('../services/analytics');
const NodeCache = require( "node-cache" );
const { findInDatabase } = require('../services/database');
const { logError } = require('../services/logger');

// Cache all facebook data for half an hour
const requestCache = new NodeCache({ stdTTL: 1800 });

const FACEBOOK_API_PREFIX = 'https://graph.facebook.com/v3.2';

// http://meanandroid.com/latestposts/how-never-expiring-facebook-access-token/
const FACEBOOK_ACCESS_TOKEN = 'FB_ACCESS_TOKEN';
const FACEBOOK_PAGE_STATS_URL = 'FB_ID?fields=about,ratings,fan_count';
const FACEBOOK_PAGE_VIEW_URL = 'FB_ID/insights?pretty=0&since=$since_in_sec&until=$until_in_sec&metric=page_views_total&period=day';
const FACEBOOK_PAGE_ENGAGEMENT_URL = 'FB_ID/insights/page_engaged_users?fields=values&since=$since_in_sec&until=$until_in_sec&period=day';
const INSTAGRAM_PAGE_BASIC = 'FB_ID?fields=follow_count,followed_by_count,media_count';

/**
 * Dashboard API (External stats dashboard)
 * @param {Express} app 
 */
function DashboardApi(app) {
    app.get('/api/dashboard/stat/:goalName', basicStat);
    app.get('/api/dashboard/stats', basicStats);
    app.get('/api/ostrich/goal/:goalName', trackGoal);
    app.post('/api/ostrich/app/goal', trackAppGoal);

    async function basicStat(request, response) {
        try {
            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, can_see_dashboard: true }
            );

            if (!myUser) {
                return response.sendStatus(403);
            }

            const results = {};
            
            for (let i = 0; i < 14; i++) {
                const result = await Analytics.getServerGoal(request.params.goalName, 'today', i);
                results[`-${i}day`] = result;
            }

            results.all = await Analytics.getServerGoal(request.params.goalName, 'all');

            response
                .status(200)
                .json(results);
        }
        catch (ex) {
            response
                .status(500)
                .json({});
        }
    }

    async function basicStats(request, response) {
        try {
            let i = 0;

            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, can_see_dashboard: true }
            );

            if (!myUser) {
                return response.sendStatus(403);
            }

            const stats = {};

            // Basic Facebook page info
            try {
                const result = await externalRequestWithCache(`${FACEBOOK_API_PREFIX}/${FACEBOOK_PAGE_STATS_URL}&access_token=${FACEBOOK_ACCESS_TOKEN}`);
                stats.facebook = result;
            } 
            catch (ex) {
                console.log('ex facebook', ex);
            }

            try {
                stats.facebookPageViewParDay = await facebookRequestToWeek(FACEBOOK_PAGE_VIEW_URL);
            } 
            catch (ex) {
                console.log('ex facebookPageViewParDay', ex);
            }

            try {
                stats.facebookPageEngagementParDay = await facebookRequestToWeek(FACEBOOK_PAGE_ENGAGEMENT_URL);
            } 
            catch (ex) {
                console.log('ex facebookPageEngagementParDay', ex);
            }

            try {
                stats.facebookEngagementLocales = await facebookLanguages();
            }
            catch (ex) {
                console.log('ex facebookEngagementLocales', ex);
            }

            // Basic Instagram info
            try {
                const result = await externalRequestWithCache(`${FACEBOOK_API_PREFIX}/${INSTAGRAM_PAGE_BASIC}&access_token=${FACEBOOK_ACCESS_TOKEN}`);
                stats.instagram = result;
            }
            catch (ex) {
                console.log('ex', ex);
            }

            try {
                const pages = [
                    '/',
                    '/login',
                    '/signup',
                    '/day-in-review',
                    '/dashboard',
                    '/graph/mood',
                    '/profile',
                    '/crisis',
                    '/consult'
                ];

                const pageViewsParDay = {
                    '-6': {},
                    '-5': {},
                    '-4': {},
                    '-3': {},
                    '-2': {},
                    '-1': {},
                    '0': {},
                };
                const pageViewsThisWeek = {};

                for (let page of pages) {
                    for(i = -6; i <1; i++) {
                        pageViewsParDay[i][page] = await Analytics.getPageViewCount(page, 'today', i * -1);
                    }

                    pageViewsThisWeek[page] = await Analytics.getPageViewCount(page, 'week');
                }

                stats.pageViewsParDay = pageViewsParDay;
                stats.pageViewsThisWeek = pageViewsThisWeek;
            }
            catch (ex) {
                console.log('ex', ex);
            }

            response
                .status(200)
                .json(stats);
        }
        catch (ex) {
            response.sendStatus(500);
        }
    }

    async function trackGoal(request, response) {
        try {
            // Todo: unique par user id

            if (!request.headers['alegrify-disable-analytics']) {
                Analytics.trackFrontEndGoal(request.params.goalName, request);
            }

            response.sendStatus(200);
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    async function trackAppGoal(request, response) {
        try {
            if (typeof request.body.goalName !== 'string' || request.body.goalName.trim() === '') {
                return response.sendStatus(409);
            }
            if (typeof request.body.appPlatform !== 'string' || request.body.appPlatform.trim() === '') {
                return response.sendStatus(409);
            }
            if (('' + request.body.appVersion).trim() === '') {
                return response.sendStatus(409);
            }
            if (typeof request.body.rnVersion !== 'string' || request.body.rnVersion.trim() === '') {
                return response.sendStatus(409);
            }

            Analytics.trackAppGoal(request.body);
            response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

async function todayAndLastWeek(method, key) {
    let today = 0;
    let lastWeek = 0;

    try {
        today = await Analytics[method](key, 'today');
    }
    catch (ex) {}
    try {
        lastWeek = await Analytics[method](key, 'today', 7);
    }
    catch (ex) {}

    const diff = today - lastWeek;

    if (diff === 0) {
        return today;
    }

    return `${today} (${diff > 0 ? '+' : ''}${diff})`;
}

async function facebookRequestToWeek(path) {
    const pageViewUrl = path
        .replace('$since_in_sec', Math.round(moment().subtract(7, 'day').startOf('day').toDate().getTime() / 1000))
        .replace('$until_in_sec', Math.round(moment().subtract(0, 'day').endOf('day').toDate().getTime() / 1000));

    const response = await externalRequestWithCache(`${FACEBOOK_API_PREFIX}/${pageViewUrl}&access_token=${FACEBOOK_ACCESS_TOKEN}`);
    const result = response.data[0].values;
    const resultObj = {};

    result.forEach((data, index) => (
        resultObj[index === 6 ? 'now' : (index - 6) + 'd'] = data.value
    ));

    return resultObj;
}

async function facebookLanguages() {
    const response = await externalRequestWithCache(`${FACEBOOK_API_PREFIX}/FB_ID/insights/page_content_activity_by_locale_unique?period=days_28&access_token=${FACEBOOK_ACCESS_TOKEN}`);
    try {
        const result = response.data[0].values[0].value;
        const sortedResult = Object
            .keys(result)
            .sort((keyA, keyB) => result[keyB] - result[keyA])
            .map(key => ({ amount: result[key], locale: key}) );

        return sortedResult;
    }
    catch (ex) {
        return [];
    }
}

async function externalRequestWithCache(url) {
    return await withCache(url, async () => JSON.parse((await externalRequest(url)).body));
}

function withCache(cacheItemName, handler) {
    return new Promise((resolve) => {
        requestCache.get(cacheItemName, async function( err, value ) {
            if (err || typeof value === 'undefined') {
                const result = await handler();
                requestCache.set(cacheItemName, result);
                return resolve(result);
            }

            return resolve(value);
        });
    });
}

module.exports = DashboardApi;