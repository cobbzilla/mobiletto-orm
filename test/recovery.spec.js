const { fallibleStorage, test, rand } = require("./test-common")
const { expect } = require("chai")

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    minWrites: 1,
    fields: { value: {} }
}

describe('storage failure test', async () => {
    before(done => fallibleStorage(done, typeDefConfig))
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll()
        expect(all).to.not.be.null
        expect(all.length).eq(0)
    })
    it("create a new thing", async () => {
        const val1 = rand(10)
        test.newThing = await test.repo.create({id: `Test_${rand(10)}`, value: val1})
        expect(test.newThing).to.not.be.null
        expect(test.newThing.value).eq(val1)
    })
    it("find new thing", async () => {
        test.newThing = await test.repo.findById(test.newThing.id)
        expect(test.newThing).to.not.be.null
    })
    it("create a new thing when one storage is failing", async () => {
        test.setFailing(0)
        const val2 = rand(10)
        test.failedThing = await test.repo.create({id: `Failed_${rand(10)}`, value: val2})
        expect(test.failedThing).to.not.be.null
        expect(test.failedThing.value).eq(val2)
    })
    it("findAll should return both things", async () => {
        const all = await test.repo.findAll()
        expect(all).to.not.be.null
        expect(all.length).eq(2)
        expect(all.filter(t => t.id === test.newThing.id).length).eq(1)
        expect(all.filter(t => t.id === test.failedThing.id).length).eq(1)
    })
    it("findVersionsById should find only one version of failedThing", async () => {
        const found = await test.repo.findVersionsById(test.failedThing.id)
        expect(found).to.not.be.null
        expect(found['local1']).to.be.undefined
        expect(found['local2']).to.not.be.null
        expect(found['local2'].length).eq(1, 'expected one versions on local2')
        expect(JSON.stringify(found['local2'][0].object)).eq(JSON.stringify(test.failedThing), 'version mismatch on local2 version 1')
    })
    it("Calling findById after failing storage has recovered succeeds and writes missing file", async () => {
        test.unsetFailing(0)
        const found = await test.repo.findById(test.failedThing.id)
        expect(found).to.not.be.null
        expect(found.version).eq(test.failedThing.version)
    })
    it("findVersionsById should find another version of failedThing", async () => {
        const found = await test.repo.findVersionsById(test.failedThing.id)
        expect(found).to.not.be.null
        expect(found['local1']).to.not.be.null
        expect(found['local1'].length).eq(1, 'expected one versions on local1')
        expect(JSON.stringify(found['local1'][0].object)).eq(JSON.stringify(test.failedThing), 'version mismatch on local1 version 1')
        expect(found['local2']).to.not.be.null
        expect(found['local2'].length).eq(1, 'expected one versions on local2')
        expect(JSON.stringify(found['local2'][0].object)).eq(JSON.stringify(test.failedThing), 'version mismatch on local2 version 1')
    })
})
