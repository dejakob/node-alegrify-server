const moment = require('moment');
const Database = require('./database');

const ANALYTICS_PREFIX = 'ANALYTICS';

/**
 * Track registration goal
 * @param {Object} [options]
 */
function trackRegistration(options = {}) {
    trackAnalytics('REGISTRATION', options);
}

/**
 * Trigger tracking that a request has been made to the server
 * Currently not called due to too much chunk
 * @param {Object} [options]
 */
function trackRequest(options = {}) {
    trackAnalytics('REQUEST', options);
}

/**
 * Track page view
 * @param {String} path 
 * @param {Object} [options]
 */
function trackPageView(path, options = {}) {
    trackAnalytics(`PAGE_VIEW_${path}`, options);
}

/**
 * Track server goal
 * @param {String} goalName 
 * @param {Object} [options]
 */
function trackServerGoal(goalName, options = {}) {
    trackAnalytics(goalName, options);
}

/**
 * Track front end goal (sent by Ostrich WEB)
 * @param {String} key
 */
function trackFrontEndGoal(key) {
    trackAnalytics(`FRONT_END_${key}`)
}

/**
 * Track app goal (sent by Ostrich in APP)
 * @param {Object} [options]
 */
function trackAppGoal(options) {
    trackAnalytics(`APP_${options.goalName}`);
    trackAnalytics(`APP_${options.appPlatform}_${options.goalName}`);
    trackAnalytics(`APP_${options.appPlatform}_${options.appVersion}_${options.goalName}`);
    trackAnalytics(`APP_RN_${options.rnVersion}_${options.goalName}`);
}

async function getRegistrationsCount(period, minus) {
    return await getAnalytics('REGISTRATION', { period, minus });
}

async function getRequestCount(period, minus) {
    return await getAnalytics('REQUEST', { period, minus });
}

async function getServerGoal(name, period, minus) {
    return await getAnalytics(name, { period, minus });
}

async function getFrontEndCount(name, period, minus) {
    return await getAnalytics(`FRONT_END_${name}`, { period, minus });
}

async function getPageViewCount(path, period, minus) {
    return await getAnalytics(`PAGE_VIEW_${path}`, { period, minus });
}

async function getAppCount(key, period, minus) {
    return await getAnalytics(`APP_${key}`, { period, minus });
}

async function getIosCount(key, period, minus) {
    return await getAnalytics(`APP_ios_${key}`, { period, minus });
}

async function getAndroidCount(key, period, minus) {
    return await getAnalytics(`APP_android_${key}`, { period, minus });
}

async function trackAnalytics(key, options = {}) {
    try {
        // Skip tracking in test environments
        if (process.env.NODE_ENV === 'test') {
            return null;
        }

        const suffixes = [''];

        if (options && options.userAgent && options.userAgent.app ) {
            suffixes.push('_' + options.userAgent.app.toUpperCase());
        }

        for (let suffix of suffixes) {
            // Overall counter
            await Database.trackGoal(`${ANALYTICS_PREFIX}_${key}${suffix}_OVERALL`);

            // Weekly counter
            await Database.trackGoal(`${ANALYTICS_PREFIX}_${key}${suffix}_${moment().format('YYYY-ww')}`);

            // Daily counter
            await Database.trackGoal(`${ANALYTICS_PREFIX}_${key}${suffix}_${moment().format('YYYY-MM-DD')}`);

            // Minute counter
            await Database.trackGoal(`${ANALYTICS_PREFIX}_${key}${suffix}_${moment().format('YYYY-MM-DDTHH:mm')}`);
        }
    }
    catch (ex) {
        console.log('ex', ex);
    }
}

async function getAnalytics(key, options = { period: 'all', minus: 0 }) {
    const minus = options.minus || 0;

    try {
        if (!options.period || options.period === 'all') {
            return await Database.getGoalCount(`${ANALYTICS_PREFIX}_${key}_OVERALL`);
        }
        else if (options.period === 'week') {
            return await Database.getGoalCount(`${ANALYTICS_PREFIX}_${key}_${moment().subtract(minus, 'week').format('YYYY-ww')}`);
        }
        else if (options.period === 'today') {
            return await Database.getGoalCount(`${ANALYTICS_PREFIX}_${key}_${moment().subtract(minus, 'day').format('YYYY-MM-DD')}`);
        }
        else if (options.period === 'minute') {
            return await Database.getGoalCount(`${ANALYTICS_PREFIX}_${key}_${moment().subtract(minus, 'minute').format('YYYY-MM-DDTHH:mm')}`);
        }
    }
    catch (ex) {
        return 0;
    }
}

module.exports = {
    trackRegistration,
    trackRequest,
    trackServerGoal,
    trackFrontEndGoal,
    trackAppGoal,
    trackPageView,

    getRegistrationsCount,
    getRequestCount,
    getServerGoal,
    getFrontEndCount,
    getPageViewCount,
    getAppCount,
    getIosCount,
    getAndroidCount
};
