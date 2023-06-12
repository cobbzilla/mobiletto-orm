const { initStorage, test, rand } = require("./test-common")
const { expect } = require("chai")

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
const category = rand(10)
const differentCategory = 'different_than_' + category

describe('indexes test', async () => {
    before(done => initStorage(done, typeDefConfig))
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll()
        expect(all).to.not.be.null
        expect(all.length).eq(0)
    })
    it("create several things", async () => {
        test.newThings = []
        for (let i = 0; i < NUM_THINGS; i++) {
            test.newThings.push(await test.repo.create({
                id: `Test_${i}_${rand(10)}`,
                value: rand(10),
                category,
                comments: rand(10)
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
