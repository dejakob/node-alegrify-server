const moment = require('moment');
const Analytics = require('./analytics');
const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('./database');
const User = require('../helpers/user');
const Connect = require('../api/connect');
const Corporate = require('../helpers/corporate');
const { CONNECTION_TYPES } = Connect;

const memoryCache = {};

function trim (s, c) {
    if (c === "]") c = "\\]";
    if (c === "\\") c = "\\\\";
    return s.replace(new RegExp(
      "^[" + c + "]+|[" + c + "]+$", "g"
    ), "");
}

/**
 * Create app state server side
 */
async function createAppState(options = {}) {
    const { userId } = options;

    if (!options.route) {
        return {};
    }

    const routes = trim(options.route, '/');
    let [ route, subRoute ] = routes.split(/\/|\?/gi);

    if (routes.indexOf('sockjs-node') === -1 && !options.disableAnalytics) {
        Analytics.trackPageView('/' + routes, options);
    }

    if (route === 'crisis') {
        return await createCrisisState(options);
    }

    if (route === 'corp') {
        if (subRoute === 'confirm') {
            return await createCorpConfirmState(options);
        }

        return await createCorpState(options);
    }

    if (userId) {
        if (route === 'dashboard') {
            return await createDashboardState(options);
        }

        if (route === 'profile') {
            return await createProfileState(options);
        }

        if (route === 'day-in-review') {
            return await createDayInReviewState(options);
        }

        if (route === 'graph') {
            if (subRoute === 'mood') {
                return await createDashboardState(options);
            }
        }
    }

    const locale = options.locale;

    return { locale };
}

async function createCrisisState(options) {
    const appState = {};

    if (!memoryCache.allCrisisResources) {
        memoryCache.allCrisisResources = await findMultipleInDatabase('CrisisResource', {});
    }

    appState.countries = [];

    if (!memoryCache.allCountries) {
        const passedIds = [];

        for (let resource of memoryCache.allCrisisResources) {
            if (passedIds.indexOf(resource.country) === -1) {
                passedIds.push(resource.country);
                appState.countries.push(await findInDatabase('Country', { _id: resource.country }));
            }
        }

        memoryCache.allCountries = appState.countries
            .map(country => {
                return {
                    _id: country._id,
                    tags: country.tags,
                    name: country.name,
                    flag: country.flag,
                    cca2: country.cca2
                }
            });
    }

    appState.countries = memoryCache.allCountries;
    appState.crisisResources = memoryCache.allCrisisResources;

    if (
        options.locals &&
        typeof options.locals.country &&
        typeof options.locals.country === 'string'
    ) {
        appState.countries.forEach(country => {
            if (
                options.locals.country === country.cca2
            ) {
                appState.myCountry = country._id;
            }
        });
    }

    return appState;
}

async function createDashboardState(options) {
    const { userId } = options;
    const appState = {};
    const moods = await findMultipleInDatabase('Mood', { user_id: userId }, { limit: 20 });

    appState.user = User.outputToSelf(await findInDatabase('User', { _id: userId }, { populate: { corporates: 'Corporate' }, myUserId: userId }));

    if (!appState.user) {
        return {};
    }

    let index = 0;
    for (let mood of moods) {
        moods[index].reflections = await findMultipleInDatabase('MoodReflection', { mood_id: mood._id });
        index++;
    }

    appState.previousMoodScores = moods
        .map(mood => ({ my_mood: mood.my_mood }));
    appState.thoughts = moods
        .map(mood => ({
            id: mood._id,
            thought: mood.thought,
            thought_event: mood.thought_event,
            my_mood: mood.my_mood,
            my_mood_type: mood.my_mood_type,
            created_at: mood.created_at,
            reflections: mood.reflections
        }));
    appState.userStatuses = (await findMultipleInDatabase('UserStatus', { user_id: userId }))
        .map(status => status.text);

    const weekScheduleWork = await findInDatabase('WeekSchedule', { user_id: userId, type: 'work' });
    appState.latestWeekSchedules = {
        work: (weekScheduleWork || {oh_utc : null}).oh_utc
    }
    const proposals = await findMultipleInDatabase(
        'ConnectionProposal',
        { to: userId, type: CONNECTION_TYPES.CONNECT2CLIENT },
    );
    appState.connectionProposals = proposals.map(p => ({
        _id: p._id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        from: p.from
    }));

    for (let corporate of (appState.user.corporates || [])) {
        appState.corporateEvents = appState.corporateEvents || [];
        appState.corporateEvents = [
            ...appState.corporateEvents,
            ...(await findMultipleInDatabase('CorporateEvent', { corporate: corporate._id }, { limit: 3 })).map(ce => ({
                _id: ce._id,
                created_at: ce.created_at,
                updated_at: ce.updated_at,
                corporate: ce.corporate,
                what: ce.what,
            }))
        ];
    }

    index = 0;
    for (let corporateEvent of (appState.corporateEvents || [])) {
        const userCorporateEvent = await findInDatabase('UserCorporateEvent', {
            corporateEventId: corporateEvent._id,
            userId
        });

        if (userCorporateEvent) {
            appState.corporateEvents[index].moodType = userCorporateEvent.moodType;
        }

        index++;
    }
    
    index = 0;
    for (let proposal of appState.connectionProposals) {
        const proposalUser = [(await findInDatabase('User', { _id: proposal.from }))]
            .map(User.outputToClient)[0];
        appState.connectionProposals[index] = {
            ...proposalUser,
            ...appState.connectionProposals[index]
        }
        index++;
    }

    appState.locale = appState.user && appState.user.locale ? appState.user.locale : options.locale;
    return appState;
}

async function createDayInReviewState(options) {
    const { userId } = options;

    return {
        dayReviews: await findMultipleInDatabase('DayReview', { user_id: userId })
    }
}

async function createProfileState(options) {
    const { userId } = options;
    const appState = {};

    appState.user = User.outputToSelf(
        await findInDatabase(
            'User',
            { _id: userId },
            { populate: { consults: 'User' } }
        )
    );

    appState.locale = appState.user && appState.user.locale ? appState.user.locale : options.locale;
    return appState;
}

async function createCorpConfirmState(options) {
    const appState = {};
    const [ nothing, invitationId ] = options.route.split('corp/confirm/');
    const allInvitationData = await findInDatabase('CorporateInvite', { _id: invitationId });

    if (allInvitationData) {
        appState.invitation = {
            corporateId: allInvitationData.corporateId,
            userId: allInvitationData.userId
        };
        appState.corporate = Corporate
            .outputToEmployee(await findInDatabase('Corporate', { _id: appState.invitation.corporateId }));
    }

    return appState;
}

async function createCorpState(options) {
    const { userId } = options;
    const [ nothing, corpRoute ] = options.route.split('corp/');
    const [ corporateId ] = (corpRoute || '').split('/');
    const appState = {};

    if (corporateId) {
        const corporate = await findInDatabase(
            'Corporate',
            { _id: corporateId },
            { populate: {
                admins: 'User',
                employees: 'User'
            } }
        );

        if (corporate) {
            appState.corporate = Corporate.outputToMe(userId)(corporate);

            // Am I admin for this corporate?
            if (corporate.admins.some(a => a._id === userId)) {
                const corporateMoodsData = await findMultipleInDatabase(
                    'CorporateMood',
                    { corporate: corporateId },
                    { createdAfter: moment().subtract(14, 'day').toDate() }
                );
                const corporateMoods = {};
    
                for (let corporateMoodItem of corporateMoodsData) {
                    const { day, mood_type, mood } = corporateMoodItem;
                    
                    corporateMoods[day] = corporateMoods[day] || {};
                    corporateMoods[day][mood_type] = corporateMoods[day][mood_type] || 0;
                    corporateMoods[day][mood_type] += mood;
                }
    
                appState.corporateMoods = corporateMoods;
                appState.corpEventsTimeline = await findMultipleInDatabase('CorporateEvent', { corporate: corporateId });
    
                const pendingInvites = await findMultipleInDatabase('CorporateInvite', { corporateId }, { populate: { userId: 'User' } });
                appState.corpPendingInvites = (pendingInvites || []).map(pi => {
                    pi.user = User.outputToCorporate(pi.userId);
                    delete pi.userId;
                    return pi;
                });
    
            }
        }
    }
    
    return appState;
}

module.exports = {
    createAppState
};
