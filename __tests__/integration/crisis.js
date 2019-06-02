const PATH = 'http://localhost:4001';
const promisfy = require('util').promisify;
const request = promisfy(require('request'));
const { clearAllState } = require('../utils/state');

describe('Landing page', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto(PATH);
        await clearAllState();
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