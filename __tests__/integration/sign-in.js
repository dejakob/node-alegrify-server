const { clearAllState } = require('../utils/state');
const { retry } = require('../utils/retry');

describe('Sign in page', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto('http://localhost:4001');
        await clearAllState();
        await page.goto('http://localhost:4001/login');
    });

    it('should be able to log in', async () => retry(async () => {
        await page.click('#user_name');
        await page.type('#user_name', 'user1');
        await page.click('#password');
        await page.type('#password', 'user1');
        await page.click('[action="/api/auth/login"] button[type="submit"]');
        await page.waitForNavigation();
        await page.click(`[href="/profile"]`);
        await page.waitForSelector('#email');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await page.waitForFunction('!!document.querySelector(\'#email\').value.length');
        const email = await page.$eval('#email', el => el.value);

        expect(email).toBe('user1@alegrify.com');
    }, 3))
});