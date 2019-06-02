const { findInDatabase, saveToDatabase, updateInDatabase, softDeleteInDatabase } = require('../services/database');
const { outputToMe } = require('../helpers/corporate');
const { logError } = require('../services/logger');
const Mail = require('../services/mail');

const EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Corporate API
 * @param {Express} app
 */
function CorpApi(app) {
    app.post('/api/corp', createCorporate);
    app.post('/api/corp/:corporateId/invite', inviteToCorporate);
    app.delete('/api/corp/:corporateId/invite/:inviteId', removeInviteFromCorporate);
    app.delete('/api/corp/:corporateId/employee/:employeeId', removeEmployeeFromCorporate);
    app.get('/api/corp/:corporateId', getCorporateById);
    app.post('/api/corp/:corporateId', linkMeToCorporate);
    app.delete('/api/corp/:corporateId', unlinkMeFromCorporate);
    app.post('/api/corp/:corporateId/event', createCorpEvent);
    app.post('/api/corp/:corporateId/event/:eventId/mood', createCorpEventMood);

    /**
     * Create corporate
     * @param {Object} request
     * @param {Object} response
     */
    async function createCorporate(request, response) {
        try {
            const { userId } = request.user;
            const {
                corp_name,
                corp_address,
                corp_address_city,
                corp_phone,
                corp_pricing_package
            } = request.body;

            if (!userId) {
                return response.status(403).json({ user: 'not_logged_in' });
            }

            const invalidFields = [
                'corp_name',
                'corp_address',
                'corp_address_city',
                'corp_phone',
                'corp_pricing_package'
            ].filter(key => typeof request.body[key] !== 'string' || request.body[key].length === 0);

            if (invalidFields.length > 0) {
                return response.status(409).json({ validationErrors: invalidFields });
            }
    
            const admins = [ userId ];
    
            const corporateId = await saveToDatabase('Corporate', {
                name: corp_name,
                address: corp_address,
                city: corp_address_city,
                phone: corp_phone,
                pricing_package: corp_pricing_package,
                admins
            })
            const me = await findInDatabase('User', { _id: userId });
            const corporates = [ ...(me.corporates || []), corporateId ];

            await updateInDatabase('User', userId, { corporates });

            response
                .status(200)
                .json({ corporateId });
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Get corporate by id
     * @param {Object} request
     * @param {Object} response
     */
    async function getCorporateById(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId } = request.params;

            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });

            return response
                .status(200)
                .json(outputToMe(userId)(allCorporateData));
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Create invitation for a user to a corporate
     * @param {Object} request
     * @param {Object} response
     */
    async function inviteToCorporate(request, response) {
        try {
            const { corporateId } = request.params;
            const {
                corp_employees_add_admin,
                corp_employees_add
            } = request.body;

            if (!corp_employees_add || !corp_employees_add.match(EMAIL_REGEX)) {
                return response
                    .status(409)
                    .json({ corp_employees_add: 'INVALID_EMAIL' });
            }

            const allUserData = await findInDatabase('User', { email: corp_employees_add });

            if (!allUserData) {
                return response
                    .status(404)
                    .json({ corp_employees_add: 'NOT_FOUND' });
            }

            const invitationId = await saveToDatabase('CorporateInvite', {
                corporateId,
                userId: allUserData._id,
                admin: corp_employees_add_admin === 'on'
            });
            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });

            // Todo: translations
            Mail.sendTemplateMail(allUserData.email, Mail.EMAIL_TEMPLATES.CORPORATE_ACCEPT_INVITATION, {
                Title: allUserData.firstName ? `We have some good news, ' ${allUserData.firstName}!` : 'We have some good news!',
                Link: `https://alegrify.com/corp/confirm/${invitationId}`,
                Corporate: allCorporateData.name
            });

            return response 
                .status(200)
                .json({ invitationId });
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Remove invitation for a user to a corporate
     * @param {Object} request
     * @param {Object} response
     */
    async function removeInviteFromCorporate(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId, inviteId } = request.params;
            const corporate = await findInDatabase('Corporate', { _id: corporateId });
            const invitation = await findInDatabase('CorporateInvite', { _id: inviteId });

            if (!corporate) {
                return response.status(404).json({});
            }

            if (corporate.admins.indexOf(userId) === -1) {
                return response.status(403).json({ AUTH: 'USER_IS_NO_ADMIN' });
            }

            if (!invitation) {
                return response.status(404).json({});
            }

            if (corporateId !== invitation.corporateId) {
                return response.status(409).json({});
            }

            await softDeleteInDatabase('CorporateInvite', inviteId);

            return response
                .status(200)
                .json({});
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Remove employee from corporate
     * @param {Object} request 
     * @param {Object} response 
     */
    async function removeEmployeeFromCorporate(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId, employeeId } = request.params;
            const corporate = await findInDatabase('Corporate', { _id: corporateId });
            const employee = await findInDatabase('User', { _id: employeeId });

            if (!corporate) {
                return response.status(404).json({});
            }

            if (corporate.admins.indexOf(userId) === -1) {
                return response.status(403).json({ AUTH: 'USER_IS_NO_ADMIN' });
            }

            const updatedEmployees = corporate.employees.filter(employee =>
                employee !== employeeId    
            );
            await updateInDatabase('Corporate', corporateId, { employees: updatedEmployees });

            const updatedCorporates = employee.corporates.filter(corporate =>
                corporate !== corporateId
            );
            await updateInDatabase('User', employeeId, { corporates: updatedCorporates });

            return response
                .status(200)
                .json({});
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Link me to corporate by id
     * @param {Object} request
     * @param {Object} response
     */
    async function linkMeToCorporate(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId } = request.params;
            const { invitationCode } = request.body;

            if (!invitationCode) {
                return response.status(409).json({ invitationCode: 'UNKNOWN' })
            }

            // Check invite
            const allInviteData = await findInDatabase('CorporateInvite', { _id: invitationCode });
            const allUserData = await findInDatabase('User', { _id: userId });

            if (
                allUserData &&
                allUserData.corporates &&
                allUserData.corporates.indexOf(corporateId) > -1
            ) {
                // Already accepted
                return response.status(200).json({});
            }
            
            if (
                !allInviteData ||
                allInviteData.userId !== userId ||
                allInviteData.corporateId !== corporateId
            ) {
                return response.status(403).json({ invitationCode: 'AUTH_FAIL' });
            }
            
            // Add to employees of corporate
            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });
            const employees = allCorporateData.employees || [];
            const admins = allCorporateData.admins || [];

            if (allInviteData.admin) {
                if (admins.indexOf(userId) === -1) {
                    admins.push(userId);
                }
            }
            else {
                if (employees.indexOf(userId) === -1) {
                    employees.push(userId);
                }
            }

            await updateInDatabase('Corporate', corporateId, { employees, admins });

            // Add to corporates of user
            const corporates = allUserData.corporates || [];

            if (corporates.indexOf(corporateId) === -1) {
                corporates.push(corporateId);
            }

            await updateInDatabase('User', userId, { corporates });

            // Remove invite
            await softDeleteInDatabase('CorporateInvite', invitationCode);

            return response
                .status(200)
                .json({});
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Unlink me from corporate by id
     * @param {Object} request 
     * @param {Object} response 
     */
    async function unlinkMeFromCorporate(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId } = request.params;

            // Remove employee from corporate
            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });
            let employees = allCorporateData.employees || [];
            let admins = allCorporateData.admins || [];

            employees = employees.filter(e => e !== userId);
            admins = admins.filter(a => a !== userId);
            await saveToDatabase('Corporate', { employees, admins });

            // Remove corporate from user
            const allUserData = await findInDatabase('User', { _id: userId });
            let corporates = allUserData.corporates || [];

            corporates = corporates.filter(c => c !== corporateId);
            await saveToDatabase('User', { corporates });

            return response
                .status(200)
                .json({});
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Create corp event
     * @param {Object} request 
     * @param {Object} response 
     */
    async function createCorpEvent(request, response) {
        try {
            const { userId } = request.user;
            const { corporateId } = request.params;
            const { what } = request.body;

            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });

            if (allCorporateData.admins.indexOf(userId) === -1) {
                return response.status(403).json({});
            }

            const event = { corporate: corporateId, what, moods: {} };

            ['HAPPY', 'SCARED', 'ANGRY', 'SAD'].forEach(key => event.moods[key] = 0);

            const corpEventId = await saveToDatabase('CorporateEvent', event);

            return response.status(200).json({ corpEventId });
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }

    /**
     * Add a mood to a corp event
     * @param {Object} request 
     * @param {Object} response 
     */
    async function createCorpEventMood(request, response) {
        // Todo blocking: fix race condition

        try {
            const { userId } = request.user;
            const { corporateId, eventId } = request.params;
            const { moodType } = request.body;

            const allCorporateData = await findInDatabase('Corporate', { _id: corporateId });

            if (
                allCorporateData.admins.indexOf(userId) === -1 &&
                allCorporateData.employees.indexOf(userId) === -1
            ) {
                return response.status(403).json({});
            }
            
            if (
                ['HAPPY', 'SCARED', 'ANGRY', 'SAD'].indexOf(moodType) === -1
            ) {
                return response.status(409).json({ moodType: 'INVALID' });
            }

            const corporateEventUpdate = await findInDatabase('CorporateEvent', { _id: eventId });
            const userCorporateEvent = await findInDatabase('UserCorporateEvent', { corporateEventId: eventId, userId });

            if (userCorporateEvent && userCorporateEvent) {
                corporateEventUpdate.moods[userCorporateEvent.moodType] -= 1;
                await updateInDatabase('UserCorporateEvent', userCorporateEvent._id, { moodType });
            }
            else {
                await saveToDatabase('UserCorporateEvent', { corporateEventId: eventId, moodType, userId });
            }

            corporateEventUpdate.moods[moodType] += 1;

            await updateInDatabase('CorporateEvent', eventId, corporateEventUpdate);

            return response.status(200).json({});
        }
        catch (ex) {
            logError(ex);
            response
                .status(500)
                .json({});
        }
    }
}

module.exports = CorpApi;