const { clearAllState } = require('../utils/state');

describe('Thought', () => {
    beforeAll(async () => {
        jest.setTimeout(70000);
        await page.goto('http://localhost:4001');
        await clearAllState();
    });

    const thoughtsCache = [];

    for (let t of ['HAPPY', 'SAD', 'ANGRY', 'SCARED']) {
        it(`create a ${t.toLowerCase()} thought`, async () => {
            const thought = {
                type: t,
                mood: 80,
                thought: 'I\'m so happy',
                event: 'Tests are running'
            };
    
            await login({ userName: 'user2', password: 'user2' });
            await page.waitForSelector('.t-thought');
            await createThought(thought);

            // Wait till the card is added
            await page.waitForFunction('[...document.querySelectorAll(\'.t-thought\')].map(t => t.outerHTML).join(\'\').match(new RegExp(\'' + thought.type + '\', \'i\'))');
            await new Promise(resolve => setTimeout(resolve, 2000));
    
            const cardHtml = await page.$eval('.t-thought', t => t.innerHTML);
            const thoughtThought = await page.$eval('.t-thought .t-thought-thought', t => t.innerHTML);
            const thoughtEvent = await page.$eval('.t-thought .t-thought-event', t => t.innerHTML);

            const thoughtLink = await page.$eval('.t-thought', t => window.location.origin + t.getAttribute('href'));
            thought.link = thoughtLink;
            thoughtsCache.push(thought);
    
            expect(thought.thought).toBe(thoughtThought);
            expect(thought.event).toBe(thoughtEvent);
            expect(cardHtml).toMatch(new RegExp(`${thought.mood}%`));
            expect(cardHtml).toMatch(new RegExp(`${thought.type}`, 'i'));
        });
    }

    it('check thought details page', async () => {
        const [ thought ] = thoughtsCache;

        await page.goto(thought.link);
        await page.waitForSelector('.t-thought-thought');

        const thoughtThought = await page.$eval('.t-thought-thought', t => t.innerHTML);
        const thoughtEvent = await page.$eval('.t-thought-event', t => t.innerHTML);

        expect(thought.thought).toBe(thoughtThought);
        expect(thought.event).toBe(thoughtEvent);
    });

    it('write a reflection', async () => {
        const [ thought ] = thoughtsCache;

        await page.goto(thought.link);
        await page.waitForSelector('.t-reflection');

        await page.type('.t-reflection', 'reflection');
        await rangeChange('.t-reliability', 0.3);
        await page.click('.t-create-reflection-form button[type="submit"]');
        await page.waitForSelector('.t-reflection-detail');

        const reflection = await page.$eval('.t-reflection-detail', r => r.innerHTML);
        const reliability = await page.$eval('.t-reflection-reliability', r => r.innerHTML);

        expect(reflection).toBe('reflection');
        expect(reliability).toBe('30%');
    });
});

async function login({ userName, password }) {
    await page.evaluate(() => { window.localStorage.clear() });
    await page.goto('http://localhost:4001/login');
    await page.click('#user_name');
    await page.type('#user_name', userName);
    await page.click('#password');
    await page.type('#password', password);
    await page.click('[action="/api/auth/login"] button[type="submit"]');
}

async function createThought({ mood, type, thought, event }) {
    await page.waitForSelector('.t-add-thought-form');
    await rangeChange('.t-add-thought-form [name="my_mood"]', mood / 100);
    await page.click('.t-add-thought-form [for="my_mood_type"]');
    await page.click(`.t-add-thought-form [for="my_mood_type_${type}"]`);
    await page.type('.t-add-thought-form [name="thought_thought"]', thought);
    await page.type('.t-add-thought-form [name="thought_event"]', event);
    await page.click('.t-add-thought-form button[type="submit"]');
}

async function rangeChange(sel, percentage) {
    const example = await page.$(sel);
    const bounding_box = await example.boundingBox();

    await page.mouse.move( bounding_box.x + bounding_box.width - 10, bounding_box.y + bounding_box.height / 2 );
    await page.mouse.down();
    await page.mouse.move( bounding_box.x + bounding_box.width * percentage, bounding_box.y + bounding_box.height / 2 );
    await page.mouse.up();
}