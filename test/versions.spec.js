import { describe, before, it } from "mocha";
import { expect } from "chai";
import { rand } from "mobiletto-orm-typedef";
import { initStorage, test } from "./test-common.js";

const thingID = "thing-" + rand(10);

describe("version management test", async () => {
    before((done) => initStorage(done, { typeName: `TestType_${rand(10)}` }));
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("should create a new thing and update it many times", async () => {
        const now = Date.now();
        test.newThing = await test.repo.create({ id: thingID, value: rand(10) });
        expect(test.newThing.ctime).greaterThanOrEqual(now, "ctime was too old");
        expect(test.newThing.mtime).equals(
            test.newThing.ctime,
            "mtime was different from ctime on newly created thing"
        );
        const maxVersions = test.repo.typeDef.maxVersions;
        let currentThing = test.newThing;
        for (let i = 0; i < maxVersions * 2; i++) {
            const update = Object.assign({}, currentThing, { value: rand(10) });
            currentThing = await test.repo.update(update, currentThing.version);
        }
        test.updatedThing = currentThing;
    });
    it("should read the max number of versions (on each storage) of the thing we just created", async () => {
        const maxVersions = test.repo.typeDef.maxVersions;
        const found = await test.repo.findVersionsById(thingID);
        expect(found).to.not.be.null;
        let local_1 = found["local_1"];
        expect(local_1).to.not.be.null;
        expect(local_1.length).eq(maxVersions, `expected ${maxVersions} versions on local_1`);
        expect(JSON.stringify(local_1[0].object)).to.not.eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_1[0]"
        );
        expect(JSON.stringify(local_1[local_1.length - 1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_1[last]"
        );
        let local_2 = found["local_2"];
        expect(local_2).to.not.be.null;
        expect(JSON.stringify(local_2[0].object)).to.not.eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_2[0]"
        );
        expect(JSON.stringify(local_2[local_2.length - 1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_2[last]"
        );
    });
});
