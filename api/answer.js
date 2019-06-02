const { findInDatabase, findMultipleInDatabase, saveToDatabase } = require('../services/database');
const { logError } = require('../services/logger');
const QUESTIONS = require('../node_modules/alegrify-web/src/data/questions.json');
const EN_TRANS = require('../node_modules/alegrify-web/src/data/translations/en.json');

/**
 * Answer API
 * @param {Express} app 
 */
function AnswerApi(app) {
    app.post('/api/answer', postAnswer);
    app.get('/api/answers/:userId', getAnswersByUserId);
    
    /**
     * Post answer
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function postAnswer(request, response) {
        const {
            question_id,
            answer
        } = request.body;
        const userId = request.user.userId;

        try {
            const answerId = await saveToDatabase('Answer', { user_id: userId, answer, question_id });
            const question = QUESTIONS.find(q => q.id === question_id);

            if (!question) {
                return response.sendStatus(409);
            }

            if (!question.answers.some(a => a.id === answer)) {
                return response.sendStatus(409);
            }

            response
                .status(200)
                .json({ answerId });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    async function getAnswersByUserId(request, response) {
        try {
            const myUserId = request.user.userId;
            const myUser = await findInDatabase(
                'User',
                { _id: myUserId, is_consult: true }
            );

            const userWeNeedAnswersFrom = request.params.userId;

            if (!myUser) {
                return response.sendStatus(403);
            }

            const myClientsIds = myUser.clients;

            // Check if userId is client of current user.
            if (
                !myClientsIds ||
                !myClientsIds.length ||
                myClientsIds.indexOf(userWeNeedAnswersFrom) === -1
            ) {
                return response.sendStatus(403);
            }

            const answers = await findMultipleInDatabase('Answer', { user_id: userWeNeedAnswersFrom });
            const answersWithQuestions = answers

                // Distinct on question id
                .filter((answer, index) =>
                    answers.findIndex(a => a.question_id === answer.question_id) === index
                )

                // Map with English translations
                .map(answer => (
                    {
                        _id: answer._id,
                        answer: EN_TRANS.QUESTIONS[answer.answer],
                        question: EN_TRANS.QUESTIONS[answer.question_id],
                        created_at: answer.created_at,
                        updated_at: answer.updated_at
                    }
                ))

            return response
                .status(200)
                .json(answersWithQuestions);
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }
}

module.exports = AnswerApi;
