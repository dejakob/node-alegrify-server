const promisfy = require('util').promisify;
const request = promisfy(require('request'));
const PATH = 'http://localhost:4001';
const { clearAllState } = require('../utils/state');

describe('Landing page', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto(PATH);
        await clearAllState();
        await page.goto(PATH);
    });

    it('should have a link to login', async () => {
        await page.waitForSelector('[href="/login"]');
    });

    it('should have a link to signup', async () => {
        await page.waitForSelector('[href="/signup"]');
    });

    describe('Server Side Rendering', () => {
        it('CSS sanity check', async () => {
            const { body } = await request(`${PATH}?ssr=1`);
            expect(body).toMatch(/\.([a-z|A-Z]+)\{/);
        });

        it('Meta sanity check', async () => {
            const { body } = await request(`${PATH}?ssr=1`);
            expect(body).toMatch(/\<meta name\=\"description\"/);
            expect(body).toMatch(/\<meta property\=\"og:description\"/);
            expect(body).toMatch(/\<link rel\=\"alternate\"/);
        });
    });
});