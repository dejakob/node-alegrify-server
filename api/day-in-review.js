const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');

/**
 * Day in Review API
 * @param {Express} app 
 */
function DayInReviewApi(app) {
    app.post('/api/day-in-review', postDayInReview);

    /**
     * Create new DayReview
     * @param {Object} request 
     * @param {Object} response 
     */
    async function postDayInReview(request, response) {
        const { dir_great_things, dir_great, dir_grateful, dir_want_to_be } = request.body;
        const userId = request.user.userId;

        const validationErrors = [
            'dir_great_things',
            'dir_great',
            'dir_grateful',
            'dir_want_to_be'
        ].map(key => {
            if (typeof request.body[key] !== 'string' || request.body[key].trim() === '') {
                return `Please fill in ${key}`;
            }
            return false;
        }).filter(a => !!a);

        if (validationErrors.length > 0) {
            return response
                .status(409)
                .json({ validationErrors });
        }

        try {
            const dayReviewId = await saveToDatabase('DayReview', {
                user_id: userId,
                dir_great_things,
                dir_great,
                dir_grateful,
                dir_want_to_be
            });

            response
                .status(200)
                .json({ dayReviewId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = DayInReviewApi;
