const request = require('request');
const moment = require('moment');
const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('./database');
const { logError } = require('./logger');
const asyncRequest = require('util').promisify(request);

const NOTIFICATION_TYPES = {
    REFLECT_AFTER_X_DAYS: 'REFLECT_AFTER_X_DAYS'
};
const ONE_SIGNAL_APP_ID = 'ONESIGNAL_API_KEY';

const { argv } = process;
const [ nodePath, scriptName, notifier, ...args ] = argv;

const notifiers = {
    writeReflection
};

if (notifier === 'help') {
    console.log(`
Alegrify's Amazing Push Notification service
(uses onesignal under the hood)
    `);
    console.log('Please add which notifier you want to run');
    console.table([
        {
            name: 'writeReflection',
            description: 'Remind user to write a reflection after x days',
            arguments: 'amount of days'
        }
    ])
}
else if (typeof notifier === 'string' && typeof notifiers[notifier] === 'function') {
    notifiers[notifier](...args);
}

/**
 * Push user to reflect on thought of x days ago
 * if he/she hasn't already
 * @param {Number} [x=3]
 */
async function writeReflection (x = 3) {
    try {
        // Todo: timezones
        const recentlyAddedMoods = await findMultipleInDatabase('Mood', {}, {
            createdAfter: moment().subtract(x, 'day').startOf('day').toDate(),
            createdBefore: moment().subtract(x, 'day').endOf('day').toDate(),
            populate: { user_id: 'User' },
            limit: 99999,
            noFilters: true
        });
        let users = recentlyAddedMoods.map(m => ({ ...m.user_id, moodId: m._id }));

        // Filter out users without playerId
        users = users.filter(u => !!u.pushNotificationId);

        // Distinct
        users = users.filter((user, index) =>
            users.findIndex(u => u._id === user._id) === index
        );

        // Limit 2000 (max limit for call onesignal)
        users = users.filter((nothing, index) => index < 2000);

        // User hasn't received passive push notification today
        const noPassivePushToday = [];
        for ([index, user] of users.entries()) {
            const hasPushToday = !!(await findInDatabase('PushNotification', {
                user_id: user._id,
                is_passive: true
            }, {
                createdAfter: moment().subtract(24, 'hour').toDate().getTime()
            }));

            if (!hasPushToday) {
                noPassivePushToday.push(user);
            }
        }
        users = noPassivePushToday;

        // User hasn't reflected before
        const hasNotReflected = [];
        for ([index, user] of users.entries()) {
            const hasReflection = !!(await findInDatabase('MoodReflection', {
                mood_id: user.moodId
            }));

            if (!hasReflection) {
                hasNotReflected.push(user);
            }
        }
        users = hasNotReflected;

        if (!users.length) {
            return true;
        }

        for (user of users) {
            const headers = {
                'Content-Type': 'application/json; charset=utf-8'
            };
            const data = { 
                app_id: ONE_SIGNAL_APP_ID,
                contents: {
    
                    // Todo: translations
                    'en': 'Let\'s relect on how you felt ' + x + ' days ago'
                },
                include_player_ids: [ user.pushNotificationId ],
                data: {
                    route: 'thought',
                    options: {
                        id: user.moodId
                    }
                }
            };
            const options = {
                host: 'onesignal.com',
                port: 443,
                path: '/api/v1/notifications',
                method: 'POST',
                uri: 'https://onesignal.com/api/v1/notifications',
                headers,
                body: JSON.stringify(data)
            };
    
            const response = await asyncRequest(options);
            const body = JSON.parse(response.body);

            await saveToDatabase('PushNotification', {
                is_passive: true,
                user_id: user._id,
                type: NOTIFICATION_TYPES.REFLECT_AFTER_X_DAYS,
                response: body,
                x
            });
        }
    }
    catch (ex) {
        logError(ex);
    }
}

module.exports = notifiers;