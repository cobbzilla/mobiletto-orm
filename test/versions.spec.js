const { initStorage, test, rand } = require("./test-common")
const { expect } = require("chai")

const thingID = 'thing-'+rand(10)

describe('version management test', async () => {
    before(done => initStorage(done, { typeName: `TestType_${rand(10)}` }))
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll()
        expect(all).to.not.be.null
        expect(all.length).eq(0)
    })
    it("should create a new thing and update it many times", async () => {
        const now = Date.now()
        test.newThing = await test.repo.create({id: thingID, value: rand(10)})
        expect(test.newThing.ctime).greaterThanOrEqual(now, 'ctime was too old')
        expect(test.newThing.mtime).equals(test.newThing.ctime, 'mtime was different from ctime on newly created thing')
        const maxVersions = test.repo.typeDef.maxVersions
        let currentThing = test.newThing
        for (let i = 0; i < maxVersions * 2; i++) {
            const update = Object.assign({}, currentThing, { value: rand(10) })
            currentThing = await test.repo.update(update, currentThing.version)
        }
        test.updatedThing = currentThing
    })
    it('should read the max number of versions (on each storage) of the thing we just created', async () => {
        const maxVersions = test.repo.typeDef.maxVersions
        const found = await test.repo.findVersionsById(thingID)
        expect(found).to.not.be.null
        let local1 = found['local1'];
        expect(local1).to.not.be.null
        expect(local1.length).eq(maxVersions, `expected ${maxVersions} versions on local1`)
        expect(JSON.stringify(local1[0].object)).to.not.eq(JSON.stringify(test.newThing), 'version mismatch on local1[0]')
        expect(JSON.stringify(local1[local1.length-1].object)).eq(JSON.stringify(test.updatedThing), 'version mismatch on local1[last]')
        let local2 = found['local2'];
        expect(local2).to.not.be.null
        expect(JSON.stringify(local2[0].object)).to.not.eq(JSON.stringify(test.newThing), 'version mismatch on local2[0]')
        expect(JSON.stringify(local2[local2.length-1].object)).eq(JSON.stringify(test.updatedThing), 'version mismatch on local2[last]')
    })
})
