const { clearAllState } = require('../utils/state');

describe('Log out', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto('http://localhost:4001');
        await clearAllState();
        await page.goto('http://localhost:4001/login');
    });

    it('should see link to log in again', async () => {
        await page.click('#user_name');
        await page.type('#user_name', 'user1');
        await page.click('#password');
        await page.type('#password', 'user1');
        await page.click('[action="/api/auth/login"] button[type="submit"]');
        await page.waitForNavigation();
        await page.click(`[href="/profile"]`);
        await page.waitForSelector('.t-logout');
        await page.click('.t-logout');
        await page.waitForSelector('[href="/login"]');
    })
});