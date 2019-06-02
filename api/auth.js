const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { EXPRESS_SECRET } = require('../config.json');
const Analytics = require('../services/analytics');
const Mail = require('../services/mail');
const { findInDatabase, saveToDatabase, updateInDatabase } = require('../services/database');
const { logError } = require('../services/logger');
const psychologistsBelgium = require('psychologists-belgium');

const EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const MIN_LENGTH_USERNAME = 5;
const MIN_LENGTH_PASSWORD = 5;

/**
 * Auth API
 * @param {Express} app 
 */
function AuthApi(app) {
    app.post('/api/auth/login', loginAuth);
    app.post('/api/auth/register', registerAuth);
    app.post('/api/auth/password', updatePassword);

    app.post('/api/auth/consult-login', loginConsult);
    app.get('/api/auth/consult-autocomplete', autocompleteConsult);
    app.get('/api/auth/consult-predict', autocompleteConsultPredict);
    app.post('/api/auth/consult-prepare', consultPrepareSignUp);
    app.get('/api/auth/consult-confirm', consultConfirmSignUp);

    app.post('/api/auth/dashboard-login', loginDashboard);

    app.post('/api/auth/preregister', preRegister);

    /**
     * Login auth
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function loginAuth(request, response) { 
        const { body } = request;

        const {
            user_name,
            password
        } = body;

        const validationErrors = {};

        if (typeof user_name !== 'string' || user_name.trim().length < MIN_LENGTH_USERNAME) {
            validationErrors.user_name = `User name should at least be ${MIN_LENGTH_USERNAME} characters long.`;
        }

        if (typeof password !== 'string' || password.length < MIN_LENGTH_PASSWORD) {
            validationErrors.password = `Password should at least be ${MIN_LENGTH_PASSWORD} characters long`;
        }

        if (Object.keys(validationErrors).length > 0) {
            return response
                .status(409)
                .json({ validation_errors: validationErrors });
        }

        try {
            const user = await findInDatabase('User', { user_name: user_name.trim() });

            if (!user) {
                return response
                    .status(401)
                    .json({ validation_errors: { user_name: 'User name is not registered' } })
            }

            const storedPassword = user.password;
            const saltAndHashAndVerifChar = storedPassword.split('$')[storedPassword.split('$').length - 1];
            const saltAndHashLength = saltAndHashAndVerifChar.length - 1;

            const salt = saltAndHashAndVerifChar.substr(0, saltAndHashLength / 2);
            const storedHash = saltAndHashAndVerifChar.substr(saltAndHashLength / 2, saltAndHashLength - 1);

            try {
                const fullSalt = '$' + storedPassword.split('$')[1] + '$' + storedPassword.split('$')[2] + '$' + salt;
                const hashedPassword = await hashPassword(password, { salt: fullSalt });

                if (storedPassword !== hashedPassword) {
                    return response
                        .status(401)
                        .json({ validation_errors: { password: 'Password is incorrect' } });
                }
            }
            catch (ex) {
                return response
                    .status(401)
                    .json({ validation_errors: { password: 'Password is incorrect' } });
            }

            const token = jwt.sign({ userId: user._id }, EXPRESS_SECRET);

            // Only count non-alegrify registrations
            if (
                user.email.indexOf('@alegrify.com') === -1 &&
                !request.headers['alegrify-disable-analytics']
            ) {
                Analytics.trackServerGoal('LOGIN', request);
            }

            response
                .status(200)
                .json({ token });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500);
        }
    }

    /**
     * Register auth
     * @param {Object} request 
     * @param {Object} response 
     * @returns {Promise}
     */
    async function registerAuth(request, response) {
        const { body } = request;

        const { 
            user_name,
            email,
            password,
            notify_me
        } = body;
        const validationErrors = {};

        if (typeof user_name !== 'string' || user_name.trim().length < MIN_LENGTH_USERNAME) {
            validationErrors.user_name = `User name should at least be ${MIN_LENGTH_USERNAME} characters long.`;
        }

        if (typeof email !== 'string' || !email.match(EMAIL_REGEX)) {
            validationErrors.email = `Please enter a valid email address`;
        }

        if (typeof password !== 'string' || password.length < MIN_LENGTH_PASSWORD) {
            validationErrors.password = `Password should at least be ${MIN_LENGTH_PASSWORD} characters long`;
        }

        if (Object.keys(validationErrors).length > 0) {
            return response
                .status(409)
                .json({ validation_errors: validationErrors });
        }
        
        try {
            const findByUserName = await findInDatabase('User', { user_name: user_name.trim() });
            const existsByUserName = findByUserName && findByUserName.user_name === user_name.trim();
            const findByEmail = await findInDatabase('User', { email });
            const existsByEmail = findByEmail && findByEmail.email === email;

            if (existsByUserName) {
                validationErrors.user_name = 'The user name is already in use, please choose another one.';
            }

            if (existsByEmail) {
                validationErrors.email = 'The email address you provided is already in use.';
            }

            if (Object.keys(validationErrors).length > 0) {
                return response
                    .status(409)
                    .json({ validation_errors: validationErrors });
            }

            const hashedPassword = await hashPassword(password);
            const userId = await saveToDatabase('User', {
                user_name: user_name.trim(),
                email,
                password: hashedPassword,
                notify_me: !!notify_me
            });

            const token = jwt.sign({ userId }, EXPRESS_SECRET);

            // Only count non-alegrify registrations
            if (
                email.indexOf('@alegrify.com') === -1 &&
                !request.headers['alegrify-disable-analytics']
            ) {
                Analytics.trackRegistration(request);

                if (!!notify_me) {
                    Analytics.trackServerGoal('REGISTER_WITH_NOTIFY_ME', request);
                }
            }

            response
                .status(200)
                .json({ token });
        }
        catch (ex) {
            logError(ex);
            response.sendStatus(500)
        }
    }
}

/**
 * Login auth
 * @param {Object} request 
 * @param {Object} response 
 * @returns {Promise}
 */
async function loginConsult(request, response) { 
    const { body } = request;

    const {
        email,
        password
    } = body;

    const validationErrors = {};

    if (typeof email !== 'string' || email.trim().length < MIN_LENGTH_USERNAME) {
        validationErrors.email = `Email should at least be ${MIN_LENGTH_USERNAME} characters long.`;
    }

    if (typeof password !== 'string' || password.length < MIN_LENGTH_PASSWORD) {
        validationErrors.password = `Password should at least be ${MIN_LENGTH_PASSWORD} characters long`;
    }

    if (Object.keys(validationErrors).length > 0) {
        return response
            .status(409)
            .json({ validation_errors: validationErrors });
    }

    try {
        const user = await findInDatabase('User', { email: email.trim() });

        if (!user) {
            return response
                .status(401)
                .json({ validation_errors: { email: 'Email is not registered' } })
        }

        if (!user.is_consult) {
            return response
                .status(401)
                .json({ validation_errors: { is_consult: 'User is not registered for consult' } });
        }

        const storedPassword = user.password;
        const saltAndHashAndVerifChar = storedPassword.split('$')[storedPassword.split('$').length - 1];
        const saltAndHashLength = saltAndHashAndVerifChar.length - 1;

        const salt = saltAndHashAndVerifChar.substr(0, saltAndHashLength / 2);

        try {
            const fullSalt = '$' + storedPassword.split('$')[1] + '$' + storedPassword.split('$')[2] + '$' + salt;
            const hashedPassword = await hashPassword(password, { salt: fullSalt });

            if (storedPassword !== hashedPassword) {
                return response
                    .status(401)
                    .json({ validation_errors: { password: 'Password is incorrect' } });
            }
        }
        catch (ex) {
            return response
                .status(401)
                .json({ validation_errors: { password: 'Password is incorrect' } });
        }

        const token = jwt.sign({ userId: user._id }, EXPRESS_SECRET);

        response
            .status(200)
            .json({ token });
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * Login to see dashboard
 * @param {Object} request 
 * @param {Object} response 
 * @returns {Promise}
 */
async function loginDashboard(request, response) {
    const { body } = request;

    const {
        email,
        password
    } = body;

    const validationErrors = {};

    if (typeof email !== 'string' || email.trim().length < MIN_LENGTH_USERNAME) {
        validationErrors.email = `Email should at least be ${MIN_LENGTH_USERNAME} characters long.`;
    }

    if (typeof password !== 'string' || password.length < MIN_LENGTH_PASSWORD) {
        validationErrors.password = `Password should at least be ${MIN_LENGTH_PASSWORD} characters long`;
    }

    if (Object.keys(validationErrors).length > 0) {
        return response
            .status(409)
            .json({ validation_errors: validationErrors });
    }

    try {
        const user = await findInDatabase('User', { email: email.trim() });

        if (!user) {
            return response
                .status(401)
                .json({ validation_errors: { email: 'Email is not registered' } })
        }

        if (!user.can_see_dashboard) {
            return response
                .status(401)
                .json({ validation_errors: { is_consult: 'User is not registered for seeing the dashboard' } });
        }

        const storedPassword = user.password;
        const saltAndHashAndVerifChar = storedPassword.split('$')[storedPassword.split('$').length - 1];
        const saltAndHashLength = saltAndHashAndVerifChar.length - 1;

        const salt = saltAndHashAndVerifChar.substr(0, saltAndHashLength / 2);

        try {
            const fullSalt = '$' + storedPassword.split('$')[1] + '$' + storedPassword.split('$')[2] + '$' + salt;
            const hashedPassword = await hashPassword(password, { salt: fullSalt });

            if (storedPassword !== hashedPassword) {
                return response
                    .status(401)
                    .json({ validation_errors: { password: 'Password is incorrect' } });
            }
        }
        catch (ex) {
            return response
                .status(401)
                .json({ validation_errors: { password: 'Password is incorrect' } });
        }

        const token = jwt.sign({ userId: user._id }, EXPRESS_SECRET);

        response
            .status(200)
            .json({ token });
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * Update user password
 * @param {Object} request 
 * @param {Object} response 
 */
async function updatePassword(request, response) {
    try {
        const { userId } = request.user;
        const {
            user_old_password,
            user_password,
            user_password_2
        } = request.body;

        const user = await findInDatabase('User', { _id: userId });

        if (!user) {
            return response.sendStatus(401);
        }

        if (typeof user_password !== 'string' || user_password.length < MIN_LENGTH_PASSWORD) {
            return response
                .status(409)
                .json({ validation_errors: { user_password: `Password needs to be at least ${MIN_LENGTH_PASSWORD} characters long` } })
        }

        if (user_password !== user_password_2) {
            return response
                .status(401)
                .json({ validation_errors: { user_password_2: 'Passwords don\'t match' } });
        }

        const storedPassword = user.password;
        const saltAndHashAndVerifChar = storedPassword.split('$')[storedPassword.split('$').length - 1];
        const saltAndHashLength = saltAndHashAndVerifChar.length - 1;

        const salt = saltAndHashAndVerifChar.substr(0, saltAndHashLength / 2);

        try {
            const fullSalt = '$' + storedPassword.split('$')[1] + '$' + storedPassword.split('$')[2] + '$' + salt;
            const hashedPassword = await hashPassword(user_old_password, { salt: fullSalt });

            if (storedPassword !== hashedPassword) {
                return response
                    .status(401)
                    .json({ validation_errors: { password: 'Current password is incorrect' } });
            }

            const newHashedPassword = await hashPassword(user_password);

            await updateInDatabase('User', userId, { password: newHashedPassword });
            return response
                .status(200)
                .json({ success: true })
        }
        catch (ex) {
            console.log('ex', ex);
            return response
                .status(401)
                .json({ validation_errors: { password: 'Current password is incorrect' } });
        }
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * Add records to preregister db
 * @param {Object} request 
 * @param {Object} response 
 */
async function preRegister(request, response) {
    try {
        const { corp_your_name, corp_company_name, corp_company_size, corp_your_email } = request.body;
        let cache = [];

        await saveToDatabase('Preregistration', {
            company: corp_company_name,
            size: corp_company_size,
            name: corp_your_name,
            email: corp_your_email,
            locale: request.query.locale || request.locale,
            request_log: JSON.parse(JSON.stringify(request, function(key, value) {
                if (typeof value === 'object' && value !== null) {
                    if (cache.indexOf(value) !== -1) {
                        // Duplicate reference found
                        try {
                            // If this value does not reference a parent it can be deduped
                            return JSON.parse(JSON.stringify(value));
                        } catch (error) {
                            // discard key if value cannot be deduped
                            return;
                        }
                    }
                    // Store value in our collection
                    cache.push(value);
                }
                return value;
            }))
        }, { excludeFromIndexes: true });

        Analytics.trackServerGoal('PREREGISTRATION');

        response
            .status(200)
            .json({});
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * 
 * @param {Object} request 
 * @param {Object} response 
 */
async function autocompleteConsult(request, response) {
    try {
        const { q } = request.query;

        if (typeof q !== 'string' || q.length < 3) {
            return response
                .status(409)
                .json({ q: 'Query needs to be at least 3 characters' });
        }

        let i = 0;
        const LIMIT = 10;

        var results = psychologistsBelgium
            .filter(psycho => {
                const valid = i < LIMIT &&
                    typeof psycho.name === 'string' &&
                    psycho.name.toLowerCase().indexOf(q.toLowerCase()) > -1;

                if (valid) {
                    i++;
                }

                return valid;
            })
            .map(psycho => psycho.name);

        return response
            .status(200)
            .json(results);
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * 
 * @param {Object} request 
 * @param {Object} response 
 */
async function autocompleteConsultPredict(request, response) {
    try {
        const { q } = request.query;

        if (typeof q !== 'string' || q.length < 3) {
            return response
                .status(409)
                .json({ q: 'Query needs to be at least 3 characters' });
        }

        let i = 0;
        const LIMIT = 1;

        var results = psychologistsBelgium
            .filter(psycho => {
                const valid = i < LIMIT &&
                    typeof psycho.name === 'string' &&
                    psycho.name.toLowerCase().indexOf(q.toLowerCase()) > -1;

                if (valid) {
                    i++;
                }

                return valid;
            });

        if (!results.length) {
            return response.status(404).json({});
        }

        return response
            .status(200)
            .json(results[0]);
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * 
 * @param {Object} request 
 * @param {Object} response 
 */
async function consultPrepareSignUp(request, response) {
    try {
        const data = request.body;
        const validationErrors = {};

        if (!data.email || !data.email.match(EMAIL_REGEX)) {
            validationErrors['email'] = 'INVALID';
        }

        if (typeof data.firstName !== 'string' || !data.firstName.length) {
            validationErrors['firstName'] = 'INVALID';
        }

        if (typeof data.lastName !== 'string' || !data.lastName.length) {
            validationErrors['lastName'] = 'INVALID';
        }

        if (typeof data.phone !== 'string' || data.phone.length < 5) {
            validationErrors['phone'] = 'INVALID';
        }

        if (['MALE', 'FEMALE', 'OTHER'].indexOf(data.gender) === -1) {
            validationErrors['gender'] = 'INVALID';
        }

        if (!data.languages || !data.languages.length) {
            validationErrors['languages'] = 'AT_LEAST_1';
        }

        const initialData = psychologistsBelgium
            .find(psycho => 
                    (
                        typeof psycho.name === 'string' &&
                        psycho.name.toLowerCase().indexOf(data.firstName.toLowerCase()) > -1 &&
                        psycho.name.toLowerCase().indexOf(data.lastName.toLowerCase()) > -1
                    ) ||
                    (
                        psycho.addresses && psycho.addresses.length &&
                        psycho.addresses.map(a => a.email || '').indexOf(data.email) > -1
                    )
                );

        let needsManualConfirmation = false;

        if (initialData && initialData.licenseNumber) {
            data.licenseNumber = initialData.licenseNumber;
        }
        else {
            needsManualConfirmation = true;
        }

        if (Object.keys(validationErrors).length > 0) {
            return response.status(409).json(validationErrors);
        }

        needsManualConfirmation = needsManualConfirmation || !(initialData.addresses || []).map(a => a.email).some(e => (e || '').match(EMAIL_REGEX));
        const santizedInput = {
            firstName: data.firstName,
            lastName: data.lastName,
            fullName: `${data.firstName} ${data.lastName}`,
            languages: data.languages,
            gender: data.gender,
            licenseNumber: data.licenseNumber || '',
            extraInfo: data.extraInfo || '',
            email: data.email,
            phone: data.phone,
            needsManualConfirmation
        };

        const pendingId = await saveToDatabase('PendingConsultSignUp', santizedInput);
        Analytics.trackServerGoal('PENDING_CONSULT_SIGN_UP', request);

        if (needsManualConfirmation) {
            Mail.sendMail({
                from: 'Alegrify Notifier <notifier@alegrify.com>',
                to: 'happy@alegrify.com',
                subject: 'Consult registration needs verification',
                text: `Verification link: /signup/confirm/${pendingId}`,
                html: `
                    <h1>Consult registration needs verification</h1>
                    <table>
                        <tbody>
                            ${Object.keys(santizedInput).map(key =>
                                `
                                    <tr>
                                        <th><strong>${key}</strong></th>
                                        <td>${santizedInput[key]}</td>
                                    </tr>
                                `    
                            ).join('')}
                            <tr>
                                <th><strong>Verification id</strong></th>
                                <td>${pendingId}</td>
                            </tr>
                        </tbody>
                    </table>
                `
            })
        }
        else {
            const origin = process.env.NODE_ENV === 'production' ? 'https://consult.alegrify.com' : 'http://localhost:3002';
            const prefix = process.env.NODE_ENV === 'production' ? '' : '[DEV] ';

            // Todo: translate
            Mail.sendTemplateMail(data.email, Mail.EMAIL_TEMPLATES.CONSULT_SIGNUP, {
                Title: `${prefix}Welcome to Alegrify Consult, ' ${data.firstName}`,
                Link: `${origin}/signup/confirm/${pendingId}`
            });
        }

        return response.status(200).json({ success: true, needsManualConfirmation });
    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * 
 * @param {Object} request 
 * @param {Object} response 
 */
async function consultConfirmSignUp(request, response) {
    try {
        const { code, userName, password } = request.body;
        const pendingSignUp = await findInDatabase('PendingConsultSignUp', { _id: code });

        const userToCreate = {
            is_consult: true,
            first_name: pendingSignUp.firstName,
            last_name: pendingSignUp.lastName,
            full_name: pendingSignUp.fullName,
            email: pendingSignUp.email,
            user_name: userName,
            password: password,

            languages: pendingSignUp.languages,
            gender: pendingSignUp.gender,
            licenseNumber: pendingSignUp.licenseNumber,
            extraInfo: pendingSignUp.extraInfo,
            email: pendingSignUp.email,
            phone: pendingSignUp.phone
        };

        const userId = await saveToDatabase('User', userToCreate);

        if (userId) {
            await softDeleteInDatabase('PendingConsultSignUp', pendingSignUp._id);
            return response.status(200).json({ userId });
        }
        else {  
            throw new Error('No user id');
        }

    }
    catch (ex) {
        logError(ex);
        response.sendStatus(500);
    }
}

/**
 * Hash password
 * One way encryption
 * @param {String} password
 * @returns {String}
 */
function hashPassword(password, options = {}) {
    return new Promise((resolve, reject) => {
        const hash = salt => bcrypt.hash(password, salt, function(err, hash) {
            if (err) {
                return reject(err);
            }

            resolve(hash);
        });

        if (options.salt) {
            return hash(options.salt);
        }

        bcrypt.genSalt(5, function(err, salt) {
            if (err) {
                return reject(err);
            }

            hash(salt);
        });
    });
}

module.exports = AuthApi;