const { clearAllState } = require('../utils/state');

describe('Sign up page', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto('http://localhost:4001');
        await clearAllState();
        await page.goto('http://localhost:4001/signup');
    });
    
    it('should be able to register', async () => {
        const now = Date.now();

        await page.click('#user_name');
        await page.type('#user_name', '__alegrify__test__user__' + now);
        await page.click('#email');
        await page.type('#email', 'test+' + now + '@alegrify.com');
        await page.click('#password');
        await page.type('#password', '__alegrify__test__user__' + now);
        await page.click(`[action="/api/sign-up"] button[type="submit"]`);
        await page.waitForNavigation();
        await page.click(`[href="/profile"]`);
        await page.waitForSelector('#email');
        await page.waitForFunction('!!document.querySelector(\'#email\').value.length');
        const email = await page.$eval('#email', el => el.value);

        expect(email).toBe('test+' + now + '@alegrify.com');
    });
});