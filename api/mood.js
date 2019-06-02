const moment = require('moment');
const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('../services/database');
const Analytics = require('../services/analytics');
const { logError } = require('../services/logger');

/**
 * Mood API
 * @param {Express} app 
 */
function MoodApi(app) {
    app.post('/api/mood', postMood);
    app.post('/api/mood/reflect', reflectMood);
    app.get('/api/thoughts/:userId', getAllThoughtsForUser);
    
    /**
     * Post mood
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function postMood(request, response) {
        const { my_mood, my_mood_type, thought_thought, thought_event } = request.body;
        const userId = request.user.userId;

        if (isNaN(Number(my_mood))) {
            return response
                .status(409)
                .json({ my_mood: 'Should be numeric value' });
        }
        else if (my_mood < 0 || my_mood > 10) {
            return response
                .status(409)
                .json({ my_mood: 'Should be value from 0 to 10' });
        }

        try {
            const moodId = await saveToDatabase('Mood', {
                user_id: userId,
                my_mood: Number(my_mood),
                my_mood_type: my_mood_type,
                thought: thought_thought,
                thought_event
            });

            const user = await findInDatabase('User', { _id: userId });
            const userEmail = user.email;

            if (userEmail.indexOf('@alegrify.com') === -1 && !request.headers['alegrify-disable-analytics']) {
                Analytics.trackServerGoal('ADD_MOOD', request);
                Analytics.trackServerGoal(`ADD_MOOD_${my_mood_type}`, request);
            }

            // Corporate sharing
            for (let key of Object.keys(request.body)) {
                if (key.indexOf('thought_corporate_') === 0 && request.body[key]) {
                    const corporateId = key.replace('thought_corporate_', '');
                    
                    await saveToDatabase('CorporateMood', {
                        corporate: corporateId,
                        mood: Number(my_mood),
                        mood_type: my_mood_type,
                        day: moment().format('YYYY-MM-DD'),
                        time: moment().format('HH:mm:ss')
                    });
                }
            }

            response
                .status(200)
                .json({ moodId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * 
     * @param {*} request 
     * @param {*} response 
     */
    async function reflectMood(request, response) {
        const { body } = request;

        try {
            const thoughtReflectKey = Object
                .keys(body)
                .find(key => key.indexOf('thought_reflect_') === 0);
            const mood_id = thoughtReflectKey.replace('thought_reflect_', '');
            const reflection = body[`thought_reflect_${mood_id}`];
            const reliability = body[`thought_reliability_${mood_id}`];

            if (typeof mood_id !== 'string' && mood_id.trim() !== '') {
                return response
                    .status(409)
                    .json({ mood_id: 'Please define mood_id in the keys of the data' });
            }

            if (typeof reflection !== 'string' && reflection.trim() !== '') {
                return response
                    .status(409)
                    .json({ reflection: 'Should be a string and cannot be empty' });
            }

            if (isNaN(Number(reliability))) {
                return response
                    .status(409)
                    .json({ reliability: 'Should have a numeric value' });
            }

            const moodReflectionId = await saveToDatabase('MoodReflection', {
                mood_id,
                reflection,
                reliability: Number(reliability)
            });


            const user = await findInDatabase('User', { _id: request.user.userId });
            const userEmail = user.email;

            if (userEmail.indexOf('@alegrify.com') === -1 && !request.headers['alegrify-disable-analytics']) {
                Analytics.trackServerGoal('ADD_REFLECTION', request);
            }

            response
                .status(200)
                .json({ moodReflectionId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Consult
     * Get moods/thoughts for a specified user
     * @param {Object} request 
     * @param {Object} response 
     */
    async function getAllThoughtsForUser(request, response) {
        try {
            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true }
            );

            const userWeNeedThoughtsFrom = request.params.userId;

            if (!myUser) {
                return response.sendStatus(403);
            }

            const myClientsIds = myUser.clients;

            // Check if userId is client of current user.
            if (
                !myClientsIds ||
                !myClientsIds.length ||
                myClientsIds.indexOf(userWeNeedThoughtsFrom) === -1
            ) {
                return response.sendStatus(403);
            }

            const thoughts = await findMultipleInDatabase('Mood', {
                user_id: userWeNeedThoughtsFrom
            });

            let index = 0;
            for (let thought of thoughts) {
                thoughts[index].reflections = await findMultipleInDatabase('MoodReflection', { mood_id: thought._id });
                index++;
            }

            return response
                .status(200)
                .json(thoughts);
        }
        catch (ex) {
            logError(ex);
            return response.sendStatus(500);
        }
    }
}

module.exports = MoodApi;