const {
    FIELDS_TO_EXPOSE_TO_SELF,
    FIELDS_TO_EXPOSE_TO_CLIENT,
    FIELDS_TO_EXPOSE_TO_CONSULT,
    FIELDS_TO_EXPOSE_TO_CORPORATE,
} = require('../config.json').USER_DATA_RULES;

function outputToSelf(user) {
    user.full_name = `${user.first_name || ''} ${user.last_name || ''}`;

    const filteredUser = {};
    FIELDS_TO_EXPOSE_TO_SELF.forEach(field => filteredUser[field] = user[field]);
    return filteredUser;
}

function outputToClient(user) {
    user.full_name = `${user.first_name || ''} ${user.last_name || ''}`;
    
    const filteredUser = {};
    FIELDS_TO_EXPOSE_TO_CLIENT.forEach(field => filteredUser[field] = user[field]);
    return filteredUser;
}

function outputToConsult(user) {
    user.full_name = `${user.first_name || ''} ${user.last_name || ''}`;
    
    const filteredUser = {};
    FIELDS_TO_EXPOSE_TO_CONSULT.forEach(field => filteredUser[field] = user[field]);
    return filteredUser;
}

function outputToCorporate(user) {
    user.full_name = `${user.first_name || ''} ${user.last_name || ''}`;
    
    const filteredUser = {};
    FIELDS_TO_EXPOSE_TO_CORPORATE.forEach(field => filteredUser[field] = user[field]);
    return filteredUser;
}

module.exports = {
    outputToSelf,
    outputToClient,
    outputToConsult,
    outputToCorporate
}