const path = require('path');
const cuid = require('cuid');
const Datastore = require('@google-cloud/datastore');
const NsqlCache = require('nsql-cache');
const dsAdapter = require('nsql-cache-datastore');
const { logError } = require('./logger');

const { outputToClient } = require('../helpers/user');
const { outputToMe } = require('../helpers/corporate');

// Todo: add indexes

const PROJECT_ID = process.env.NODE_ENV === 'production' ? 
    'PROJECT_ID' :
    'PROJECT_ID_DEV';
const BULK_POST_LIMIT = 100;

let dataStore;
let cache;

/**
 * Connect to database
 * @returns {Datastore}
 */
function connectDatabase() {
    if (!dataStore) {  
        dataStore = new Datastore({
            projectId: PROJECT_ID,       
            keyFilename: path.join(__dirname, process.env.NODE_ENV === 'production' ? '../GOOGLE_CLOUD_CONFIG.json' : '../GOOGLE_CLOUD_CONFIG_DEV.json')
        });
        const db = dsAdapter(dataStore); // Nsql database adapter
        cache = new NsqlCache({ db }); // Nsql cache instance
    }

    return dataStore;
}


/**
 * Find latest document in database
 * @param {String} modelName
 * @param {Object} params
 * @param {Object} [options]
 * @returns {Promise}
 */
async function findInDatabase(modelName, params, options) {
    try {
        const results = await findMultipleInDatabase(
            modelName,
            params,
            Object.assign({}, { limit: 1 }, options)
        );
    
        if (results && results.length) {
            return results[0];
        }
    
        return null;
    }
    catch (ex) {
        logError(ex);
        return null;
    }
}

/**
 * 
 * @param {String} modelName 
 * @param {Object} [params={}]
 * @param {Object} [options={}]
 * @param {Object} [options.populate = {}]
 * @param {Object} [options.limit = 30]
 * @param {Object} [options.offset = 0]
 * @param {Object} [options.noFilters = false]
 * @param {String} [options.myUserId]
 * @param {Date} [options.createdBefore]
 * @param {Date} [options.createdAfter]
 * @returns {Promise}
 */
async function findMultipleInDatabase(modelName, params = {}, options = {}) {
    try {
        const store = connectDatabase();
        let query = store 
            .createQuery(modelName);

        const populationKeys = options.populate && Object.keys(options.populate);
        const populationValues = Object.assign({}, options.populate);
        delete options.populate;
    
        Object
            .keys(params)
            .forEach(paramKey => {
                query = query.filter(paramKey, '=', params[paramKey]);
            });

        if (options.createdAfter) {
            query = query.filter('created_at', '>', options.createdAfter);

            if (options.createdBefore) {
                query = query.filter('created_at', '<', options.createdBefore);
            }

            query = query.order('created_at', { descending: true });
        }
        else {
            // Will filter out deleted
            query = query.filter('updated_at', '>', new Date('2018-01-01T00:00:00'));
            query = query.order('updated_at', { descending: true });
        }

        query = query.limit(options.limit || 50);
        query = query.offset(options.offset || 0);
    
        let results = await store.runQuery(query);
        let index = 0;

        // Filter out _deleted
        results[0] = results[0] && results[0].filter(result => !result._deleted);

        if (populationKeys && populationKeys.length && results[0]) {

            // For each result
            for (let result of results[0]) {

                // For each field that needs to be populated
                for (populationKey of populationKeys) {
                    if (result[populationKey]) {
                        const model = populationValues[populationKey];
                        const originalFieldValue = results[0][index][populationKey];

                        let filter = a => a;

                        if (!options.noFilters) {
                            if (model === 'User') {
                                filter = outputToClient;
                            }
                            else if (model === 'Corporate') {
                                filter = outputToMe(options.myUserId)
                            }
                        }

                        if (Array.isArray(originalFieldValue)) {

                            // For each value on the field
                            let index2 = 0;
                            for (let originalFieldValueItem of originalFieldValue) {
                                results[0][index][populationKey][index2] = filter(await findInDatabase(model, { _id: originalFieldValueItem }));
                                if (results[0][index][populationKey][index2]._deleted) {
                                    delete results[0][index][populationKey][index2];
                                }
                                index2++;
                            }

                            results[0][index][populationKey] = results[0][index][populationKey].filter(r => !r._deleted)
                        }
                        else {
                            results[0][index][populationKey] = filter(await findInDatabase(model, { _id: originalFieldValue }));
                            if (results[0][index][populationKey]._deleted) {
                                delete results[0][index][populationKey];
                            }
                        }
                    }
                }

                index++;
            }       
        }

        return results[0];
    }
    catch (ex) {
        logError(ex);
        return [];
    }
}

/**
 * Save document(s) to database
 * @param {String} modelName 
 * @param {Object|Array.<Object>} value 
 * @returns {Promise}
 */
async function saveToDatabase(modelName, value, options = {}) {
    try {
        const store = connectDatabase();
        const items = Array.isArray(value) ? value : [ value ];
        const ids = [];

        if (items.length > BULK_POST_LIMIT) {
            throw new Error('TOO_MANY_ITEMS');
        }

        for (let item of items) {

            const kind = modelName;
            // The name/ID for the new entity
            const id = cuid();
            ids.push(id);

            // The Cloud Datastore key for the new entity
            const taskKey = store.key([kind, id]);

            // Prepares the new entity
            const obj = {
                key: taskKey,
                data: Object.assign({}, item, {
                    _id: id,
                    _deleted: false,
                    created_at: new Date(),
                    updated_at: new Date(),
                    excludeFromIndexes: options.excludeFromIndexes || []
                })
            };

            // Saves the entity
            try {
                await store.save(obj);
            }
            catch (ex) {
                throw ex;
            }
        }

        return ids && ids[0];
    }
    catch (ex) {
        logError(ex);
        return null;
    }
}

/**
 * @async
 * @param {String} modelName 
 * @param {String} id 
 * @param {Object} mutations 
 */
async function updateInDatabase(modelName, id, mutations) {
    const store = connectDatabase();
    const kind = modelName;

    if (typeof id !== 'string') {
        throw new Error('updateInDatabase: please provide a string as id when updating' + id);
    }

    // The Cloud Datastore key for the new entity
    const taskKey = store.key([kind, id]);
    const original = await findInDatabase(kind, { _id: id });
    const data = Object.assign({}, original, mutations, { updated_at: new Date() });

    // Prepares the new entity
    const obj = {
        key: taskKey,
        data
    };

    await store.save(obj);
    return data;
}

/**
 * @async
 * @param {String} modelName 
 * @param {Object} query 
 * @param {Object} mutations 
 */
async function upsertToDatabase(modelName, query, mutations) {
    const currentResult = await findInDatabase(modelName, query);

    if (currentResult && currentResult._id) {
        return await updateInDatabase(modelName, currentResult._id, mutations);
    }

    return await saveToDatabase(modelName, mutations);
}

// Todo: fail check increment
async function trackGoal(goal) {
    const currentResult = await findInDatabase('StatGoal', { key: goal });

    if (currentResult && currentResult._id && currentResult.value) {
        return await updateInDatabase('StatGoal', currentResult._id, { key: goal, value: currentResult.value + 1 });
    }

    return await saveToDatabase('StatGoal', { key: goal, value: 1 });
}

async function getGoalCount(goal) {
    try {
        const currentResult = await findInDatabase('StatGoal', { key: goal });

        if (currentResult && currentResult.value) {
            return currentResult.value * 1;
        }
    
        return 0;
    }
    catch (ex) {
        logError(ex);
        return 0;
    }
}

async function softDeleteInDatabase(modelName, id) {
    return await updateInDatabase(modelName, id, { _deleted: true, updated_at: 0  });
}

module.exports = {
    connectDatabase,
    findInDatabase,
    findMultipleInDatabase,
    saveToDatabase,
    updateInDatabase,
    upsertToDatabase,
    trackGoal,
    getGoalCount,
    softDeleteInDatabase
};