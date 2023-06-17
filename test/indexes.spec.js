const { initStorage, test, rand } = require("./test-common")
const { MobilettoOrmError } = require('mobiletto-orm-typedef')
const { expect, assert} = require("chai")

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    fields: {
        value: {
            index: true
        },
        category: {
            index: true
        },
        comments: {}
    }
}

const NUM_THINGS = 5
const LAST_THING_INDEX = NUM_THINGS - 1
const category = rand(10)
const lastComments = 'last_comments_' + rand(10)
const differentCategory = 'different_than_' + category

describe('indexes test', async () => {
    before(done => initStorage(done, typeDefConfig))
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll()
        expect(all).to.not.be.null
        expect(all.length).eq(0)
    })
    it("findBy(category) returns empty array", async () => {
        const found = await test.repo.findBy('category', category)
        expect(found).to.not.be.null
        expect(Array.isArray(found)).to.be.true
        expect(found.length).eq(0)
    })
    it("findBy(category, {exists: true}) returns false", async () => {
        const exists = await test.repo.findBy('category', category, { exists: true })
        expect(exists).to.be.false
    })
    it("findBy(category, {first: true}) returns null", async () => {
        const found = await test.repo.findBy('category', category, { first: true })
        expect(found).to.be.null
    })
    it("findBy(comments) throws error because field is not indexed", async () => {
        try {
            const found = await test.repo.findBy('comments', 'anything')
            assert.fail(`expected findBy(comments) to throw MobilettoOrmError for non-existent index, but it returned ${JSON.stringify(found)}`)
        } catch (e) {
            expect(e instanceof MobilettoOrmError).to.be.true
        }
    })
    it("findBy(comments, {exists: true}) throws error because field is not indexed", async () => {
        try {
            const found = await test.repo.findBy('comments', 'anything', {exists: true})
            assert.fail(`expected findBy(comments, {exists: true}) to throw MobilettoOrmError for non-existent index, but it returned ${JSON.stringify(found)}`)
        } catch (e) {
            expect(e instanceof MobilettoOrmError).to.be.true
        }
    })
    it("findBy(comments, {first: true}) throws error because field is not indexed", async () => {
        try {
            const found = await test.repo.findBy('comments', 'anything', {first: true})
            assert.fail(`expected findBy(comments, {first: true}) to throw MobilettoOrmError for non-existent index, but it returned ${JSON.stringify(found)}`)
        } catch (e) {
            expect(e instanceof MobilettoOrmError).to.be.true
        }
    })
    it("create several things", async () => {
        test.newThings = []
        for (let i = 0; i < NUM_THINGS; i++) {
            test.newThings.push(await test.repo.create({
                id: `Test_${i}_${rand(10)}`,
                value: rand(10),
                category,
                comments: i === LAST_THING_INDEX ? lastComments : rand(10)
            }))
        }
    })
    it("findBy(value) returns each item", async () => {
        for (let i = 0; i < NUM_THINGS; i++) {
            const thing = test.newThings[i]
            const found = await test.repo.findBy('value', thing.value)
            expect(found).to.not.be.null
            expect(found.length).eq(1)
            expect(JSON.stringify(found[0])).eq(JSON.stringify(thing))
        }
    })
    it("findBy(category) returns all the things", async () => {
        const found = await test.repo.findBy('category', category)
        expect(found).to.not.be.null
        expect(found.length).eq(NUM_THINGS)
        for (let i = 0; i < NUM_THINGS; i++) {
            expect(found.filter(f => JSON.stringify(f) === JSON.stringify(test.newThings[i])).length).eq(1)
        }
    })
    it("findBy(category, { predicate: t => t.comments === lastComments }) returns only one thing", async () => {
        const found = await test.repo.findBy('category', category, { predicate: t => t.comments === lastComments })
        expect(found).to.not.be.null
        expect(found.length).eq(1)
        expect(JSON.stringify(found[0])).eq(JSON.stringify(test.newThings[LAST_THING_INDEX]))
    })
    it("safeFindBy(category) returns all the things", async () => {
        const found = await test.repo.safeFindBy('category', category)
        for (let i = 0; i < NUM_THINGS; i++) {
            expect(found.filter(f => JSON.stringify(f) === JSON.stringify(test.newThings[i])).length).eq(1)
        }
    })
    it("findBy(category, {exists: true}) returns true", async () => {
        const exists = await test.repo.findBy('category', category, { exists: true })
        expect(exists).to.be.true
    })
    it("findBy(category, {first: true}) returns the first matching thing found", async () => {
        const found = await test.repo.findBy('category', category, { first: true })
        expect(found).to.not.be.null
        expect(typeof(found)).eq('object')
        expect(test.newThings.filter(t => JSON.stringify(t) === JSON.stringify(found)).length).eq(1)
    })
    it("should update the category of one thing", async () => {
        const update = Object.assign({}, test.newThings[0], {category: differentCategory})
        test.updatedThing = await test.repo.update(update, test.newThings[0].version)
        expect(test.updatedThing).to.not.be.null
        expect(test.updatedThing.ctime).eq(test.newThings[0].ctime)
        expect(test.updatedThing.category).eq(differentCategory)
    })
    it("findBy(category) returns once less thing than before", async () => {
        const found = await test.repo.findBy('category', category)
        expect(found).to.not.be.null
        expect(found.length).eq(NUM_THINGS - 1)
        for (let i = 1; i < NUM_THINGS; i++) {
            expect(found.filter(f => JSON.stringify(f) === JSON.stringify(test.newThings[i])).length).eq(1)
        }
    })
})
