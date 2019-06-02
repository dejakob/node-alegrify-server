const Analytics = require('./services/analytics');
const { connectDatabase, saveToDatabase, findInDatabase } = require('./services/database');

initServer();

// Todo: move to another service with actual crontabs
const cron = require('node-cron');
const { writeReflection } = require('./services/push-notification');
cron
    .schedule(
        '0 14 * * *',
        writeReflection,
        { scheduled: true, timezone: 'Europe/Brussels' }
    )
    .start();

async function initServer() {
    try {
        const express = require('express');
        const app = express();

        require('./middleware').forEach(middleware => middleware(app));
        require('./api')(app);
        require('./router')(app);

        // Countries migration
        const lastCountry = await findInDatabase('Country', { cca2: 'WS' });

        if (!lastCountry || !lastCountry._id || lastCountry.cca2 !== 'WS') {
            const worldCountries = require('world-countries');
            worldCountries.map(country => {
                saveToDatabase('Country', country);
            });
        }

        const crisisResources = require('./data/default-crisis-resources.json');
        for (let crisisResource of crisisResources) {
            const resource = await findInDatabase('CrisisResource', { name: crisisResource.name });

            if (!resource || resource.name !== crisisResource.name) {
                const country = await findInDatabase('Country', { cca2: crisisResource.country.toUpperCase() });
                if (country) {
                    await saveToDatabase('CrisisResource', {...crisisResource, country: country._id});
                }
            }
        }
    }
    catch (err) {
        console.log('connect to db failed', err);

        // Retry until infinity
        if (process.env.NODE_ENV === 'production') {
            setTimeout(initServer, 10000);
        }

    }
}
