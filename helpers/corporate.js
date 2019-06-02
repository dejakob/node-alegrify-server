const FIELDS_TO_EXPOSE_TO_EMPLOYEE = [
    '_id',
    'name',
    'address',
    'address_city',
    'phone'
];
const FIELDS_TO_EXPOSE_TO_ADMIN = [
    ...FIELDS_TO_EXPOSE_TO_EMPLOYEE,
    'admins',
    'employees',
    'pricing_package'
];

function outputToMe(myUserId) {
    return c => {
        if (!myUserId) {
            return {};
        }

        if ((c.admins || []).some(a => a === myUserId || a._id === myUserId)) {
            return outputToAdmin(c);
        }
    
        if ((c.employees || []).some(e => e === myUserId ||  e._id === myUserId)) {
            return outputToEmployee(c);
        }
    
        return {};
    }
}

function outputToEmployee(corporate) {
    const filteredCorporate = {};
    FIELDS_TO_EXPOSE_TO_EMPLOYEE
        .forEach(field => filteredCorporate[field] = corporate[field]);
    return filteredCorporate;
}

function outputToAdmin(corporate) {
    const filteredCorporate = {};
    FIELDS_TO_EXPOSE_TO_ADMIN
        .forEach(field => filteredCorporate[field] = corporate[field]);
    return filteredCorporate;
}

module.exports = {
    outputToMe,
    outputToEmployee,
    outputToAdmin
};