const sgMail = require('@sendgrid/mail');
sgMail.setApiKey('SENDGRID_API_KEY');

const EMAIL_TEMPLATES = {
    CONSULT_SIGNUP: 'SENDGRID_TEMPLATE_ID',
    CORPORATE_ACCEPT_INVITATION: 'SENDGRID_TEMPLATE_ID'
};
const EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Send an email through Twilio SendGrid
 * @param {Object} options 
 * @param {String} [options.from=noreply@alegrify.com]
 * @param {String} options.to
 * @param {String} options.subject
 * @param {String} options.text
 * @param {String} [options.html]
 */
function sendMail(options) {
    if (!options.from) {
        options.from = 'noreply@alegrify.com';
    }

    if (!options.to || !options.to.match(EMAIL_REGEX)) {
        throw new Error('options.to should be valid email address');
    }

    if (!options.subject || !options.subject.length) {
        throw new Error('options.subject should contain some text');
    }

    if (!options.text || !options.text.length) {
        throw new Error('options.text should contain some text');
    }

    if (process.env.NODE_ENV !== 'production' && options.to !== 'happy@alegrify.com') {
        options.to = 'jakobvti@gmail.com';
    }

    const msg = {
        to: options.to,
        from: options.from,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text
    };

    sgMail.send(msg);
}

/**
 * Send a mail with a SendGrid template
 * @param {String} to 
 * @param {String} templateId 
 * @param {Object} data 
 */
function sendTemplateMail(to, templateId, data) {
    if (!to || !to.match(EMAIL_REGEX)) {
        throw new Error('to should be valid email address');
    }

    if (process.env.NODE_ENV !== 'production') {
        to = 'jakobvti@gmail.com';
    }

    sgMail.send({
        to,
        from: 'noreply@alegrify.com',
        templateId,
        dynamic_template_data: data
    });
}

module.exports = {
    EMAIL_TEMPLATES,

    sendMail,
    sendTemplateMail
};