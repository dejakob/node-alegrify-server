const { findInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

/**
 * WeekSchedule API
 * @param {Express} app 
 */
function WeekScheduleApi(app) {
    app.post('/api/week-schedule', postWeekSchedule);

    /**
     * Post week schedule
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function postWeekSchedule(request, response) {
        const { week_schedule_oh_utc, week_schedule_type } = request.body;
        const userId = request.user.userId;

        if (typeof week_schedule_oh_utc !== 'string' || week_schedule_oh_utc.trim() === '') {
            return response
                .status(409)
                .json({ text: 'week_schedule_oh_utc should be a string with at least one character' });
        }

        try {
            const weekScheduleId = await saveToDatabase('WeekSchedule', {
                user_id: userId,
                type: week_schedule_type,
                oh_utc: week_schedule_oh_utc
            });

            response
                .status(200)
                .json({ weekScheduleId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = WeekScheduleApi;