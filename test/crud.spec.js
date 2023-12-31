import { describe, before, it } from "mocha";
import { expect, assert } from "chai";
import {
    FIND_FIRST,
    MobilettoOrmError,
    MobilettoOrmNotFoundError,
    MobilettoOrmSyncError,
    MobilettoOrmValidationError,
    rand,
} from "mobiletto-orm-typedef";
import { initStorage, test } from "./test-common.js";

const thingID = "thing-" + rand(10);
const thingValue1 = "thingValue1-" + rand(3);
const thingValue2 = "thingValue2-" + rand(3);

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    fields: { value: {} },
};

describe("CRUD test", async () => {
    before((done) => initStorage(done, typeDefConfig));
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("should fail to read a thing that does not exist", async () => {
        try {
            const found = await test.repo.findById(thingID);
            assert.fail(`expected test.repo.findById to throw MobilettoOrmNotFoundError, but it returned ${found}`);
        } catch (e) {
            expect(e).instanceof(MobilettoOrmNotFoundError, "incorrect exception type");
            expect(e.id).equals(thingID, "incorrect exception.id");
        }
    });
    it("should return false when checking existence on a thing that does not exist", async () => {
        expect(await test.repo.exists(thingID)).to.be.false;
    });
    it("should return null when calling safeFindById on a thing that does not exist", async () => {
        const found = await test.repo.safeFindById(thingID);
        expect(found).to.be.null;
    });
    it("should create a new thing", async () => {
        const now = Date.now();
        test.newThing = await test.repo.create({ id: thingID, value: thingValue1 });
        expect(test.newThing._meta.ctime).greaterThanOrEqual(now, "ctime was too old");
        expect(test.newThing._meta.mtime).equals(
            test.newThing._meta.ctime,
            "mtime was different from ctime on newly created thing"
        );
    });
    it("should read the thing we just created", async () => {
        const found = await test.repo.findById(thingID);
        expect(found).to.not.be.null;
        expect(found._meta.version).eq(test.newThing._meta.version);
    });
    it("should read the thing we just created with safeFindById", async () => {
        const found = await test.repo.safeFindById(thingID);
        expect(found).to.not.be.null;
        expect(found._meta.version).eq(test.newThing._meta.version);
    });
    it("should fail to create a new thing with the same ID", async () => {
        try {
            const duplicate = await test.repo.create({ id: thingID, value: thingValue1 });
            assert.fail(`expected test.repo.create to throw MobilettoOrmValidationError, but it returned ${duplicate}`);
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, "incorrect exception type");
            expect(Object.keys(e.errors).length).equals(1, "expected one validation error");
            expect(e.errors[test.repo.typeDef.idFieldName()].length).equals(1, "expected one id validation error");
            expect(e.errors[test.repo.typeDef.idFieldName()][0]).equals(
                "exists",
                "expected one id.exists validation error"
            );
        }
    });
    it("should read the one version (on each storage) of the thing we just created", async () => {
        const found = await test.repo.findVersionsById(thingID);
        expect(found).to.not.be.null;
        expect(found["local_1"]).to.not.be.null;
        expect(found["local_1"].length).eq(1, "expected one version on local_1");
        expect(JSON.stringify(found["local_1"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_1"
        );
        expect(found["local_2"]).to.not.be.null;
        expect(found["local_2"].length).eq(1, "expected one version on local_2");
        expect(JSON.stringify(found["local_2"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_1"
        );
    });
    it("should return true when checking existence on the thing we just created", async () => {
        expect(await test.repo.exists(thingID)).to.be.true;
    });
    it("findAll should return an array containing the thing we just created", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(all[0].id).eq(test.newThing.id);
        expect(all[0]._meta.version).eq(test.newThing._meta.version);
    });
    it("should fail to update the thing when not passing a current version", async () => {
        try {
            const update = Object.assign({}, test.newThing, { value: thingValue2 });
            update._meta = { id: test.newThing._meta.id };
            test.updatedThing = await test.repo.update(update);
        } catch (e) {
            expect(e).instanceof(MobilettoOrmError, "incorrect exception type");
        }
    });
    it("should fail to update the thing when passing an incorrect current version", async () => {
        try {
            const newVersion = test.repo.typeDef.newVersion();
            const update = Object.assign({}, test.newThing, { value: thingValue2 });
            update._meta = Object.assign({}, test.newThing._meta, { version: newVersion });
            test.updatedThing = await test.repo.update(update);
            assert.fail(
                `expected repo.update to fail with MobilettoOrmSyncError, but returned: ${JSON.stringify(
                    test.updatedThing
                )}`
            );
        } catch (e) {
            expect(e).instanceof(MobilettoOrmSyncError, "incorrect exception type");
        }
    });
    it("should update the thing we just created", async () => {
        const update = Object.assign({}, test.newThing, { value: thingValue2 });
        test.updatedThing = await test.repo.update(update);
        expect(test.updatedThing).to.not.be.null;
        expect(test.updatedThing._meta.ctime).eq(test.newThing._meta.ctime);
        expect(test.updatedThing.value).eq(thingValue2);
    });
    it("should read the thing we just updated", async () => {
        const found = await test.repo.findById(thingID);
        expect(found).to.not.be.null;
        expect(found._meta.version).eq(test.updatedThing._meta.version);
    });
    it("should return true when checking existence on the thing we just updated", async () => {
        expect(await test.repo.exists(thingID)).to.be.true;
    });
    it("should read the two versions (on each storage) of the thing we just updated", async () => {
        const found = await test.repo.findVersionsById(thingID);
        expect(found).to.not.be.null;
        expect(found["local_1"]).to.not.be.null;
        expect(found["local_1"].length).eq(2, "expected two versions on local_1");
        expect(JSON.stringify(found["local_1"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_1 version 1"
        );
        expect(JSON.stringify(found["local_1"][1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_1 version 2"
        );
        expect(found["local_2"]).to.not.be.null;
        expect(found["local_2"].length).eq(2, "expected two versions on local_2");
        expect(JSON.stringify(found["local_2"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_2 version 1"
        );
        expect(JSON.stringify(found["local_2"][1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_2 version 2"
        );
    });
    it("findAll should return an array containing the thing we just updated", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(all[0]._meta.id).eq(test.updatedThing._meta.id);
        expect(all[0]._meta.version).eq(test.updatedThing._meta.version);
    });
    it("should fail to remove a thing that does not exist", async () => {
        const nonExistentID = rand(10);
        try {
            const removed = await test.repo.remove(nonExistentID);
            assert.fail(
                `expected test.repo.remove to throw MobilettoOrmNotFoundError for non-existent path, but it returned ${JSON.stringify(
                    removed
                )}`
            );
        } catch (e) {
            expect(e).instanceof(MobilettoOrmNotFoundError, "incorrect exception type");
            expect(e.id).equals(nonExistentID, "incorrect exception.id");
        }
    });
    it("should fail to remove a thing when passing an out-of-date version", async () => {
        try {
            const removed = await test.repo.remove(test.newThing);
            assert.fail(
                `expected test.repo.remove to throw MobilettoOrmSyncError for obsolete version, but it returned ${JSON.stringify(
                    removed
                )}`
            );
        } catch (e) {
            expect(e).instanceof(MobilettoOrmSyncError, "incorrect exception type");
            expect(e.id).equals(test.updatedThing._meta.id, "incorrect exception.id");
        }
    });
    it("should fail to purge a thing that has not been removed", async () => {
        try {
            const purged = await test.repo.purge(test.updatedThing._meta.id);
            assert.fail(
                `expected test.repo.purge to throw MobilettoOrmSyncError for un-removed object, but it returned ${JSON.stringify(
                    purged
                )}`
            );
        } catch (e) {
            expect(e).instanceof(MobilettoOrmSyncError, "incorrect exception type");
            expect(e.id).equals(test.updatedThing._meta.id, "incorrect exception.id");
        }
    });
    it("should remove the thing we updated", async () => {
        test.removedThing = await test.repo.remove(test.updatedThing._meta.id, test.updatedThing._meta.version);
        expect(test.removedThing).to.not.be.null;
        expect(test.removedThing._meta.removed).eq(true);
        expect(test.removedThing._meta.mtime).greaterThanOrEqual(test.updatedThing._meta.mtime);
        expect(test.removedThing._meta.ctime).eq(test.updatedThing._meta.ctime);
        expect(test.removedThing._meta.id).eq(test.updatedThing._meta.id);
        expect(test.removedThing._meta.version).not.eq(test.updatedThing._meta.version);
        expect(typeof test.removedThing.value).eq("undefined");
    });
    it("should read the three versions (on each storage) of the thing we just removed", async () => {
        const found = await test.repo.findVersionsById(thingID);
        expect(found).to.not.be.null;
        expect(found["local_1"]).to.not.be.null;
        expect(found["local_1"].length).eq(3, "expected three versions on local_1");
        expect(JSON.stringify(found["local_1"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_1 version 1"
        );
        expect(JSON.stringify(found["local_1"][1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_1 version 2"
        );
        expect(JSON.stringify(found["local_1"][2].object)).eq(
            JSON.stringify(test.removedThing),
            "version mismatch on local_1 version 3"
        );
        expect(found["local_2"]).to.not.be.null;
        expect(found["local_2"].length).eq(3, "expected three versions on local_2");
        expect(JSON.stringify(found["local_2"][0].object)).eq(
            JSON.stringify(test.newThing),
            "version mismatch on local_2 version 1"
        );
        expect(JSON.stringify(found["local_2"][1].object)).eq(
            JSON.stringify(test.updatedThing),
            "version mismatch on local_2 version 2"
        );
        expect(JSON.stringify(found["local_2"][2].object)).eq(
            JSON.stringify(test.removedThing),
            "version mismatch on local_2 version 3"
        );
    });

    it("should fail to read the thing we just removed", async () => {
        try {
            const found = await test.repo.findById(test.removedThing._meta.id);
            assert.fail(
                `expected test.repo.findById to throw MobilettoOrmNotFoundError for removed path, but it returned ${JSON.stringify(
                    found
                )}`
            );
        } catch (e) {
            expect(e).instanceof(MobilettoOrmNotFoundError, "incorrect exception type");
            expect(e.id).equals(test.removedThing._meta.id, "incorrect exception.id");
        }
    });
    it("findAll should return an empty array after removing the thing", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("findAllIncludingRemoved should return an array containing the removed thing", async () => {
        const all = await test.repo.findAllIncludingRemoved();
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(all[0]._meta.id).eq(test.removedThing._meta.id);
        expect(all[0]._meta.version).eq(test.removedThing._meta.version);
        expect(all[0]._meta.removed).eq(true);
    });
    it("findAll with opts {removed:true} should return an array containing the removed thing", async () => {
        const all = await test.repo.findAll({ removed: true });
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(all[0]._meta.id).eq(test.removedThing._meta.id);
        expect(all[0]._meta.version).eq(test.removedThing._meta.version);
        expect(all[0]._meta.removed).eq(true);
    });
    it("should create a new thing to forcibly purge", async () => {
        const now = Date.now();
        test.newThing2 = await test.repo.create({ id: thingID + rand(2), value: rand(2) });
        expect(test.newThing2._meta.ctime).greaterThanOrEqual(now, "ctime was too old");
        expect(test.newThing2._meta.mtime).equals(
            test.newThing2._meta.ctime,
            "mtime was different from ctime on newly created thing"
        );
    });
    it("should forcibly purge the new thing", async () => {
        const result = await test.repo.purge(test.newThing2._meta.id, { force: true });
        expect(result).is.not.undefined;
        expect(result.length).eq(test.storages.length);
    });
    it("should no longer find the new thing", async () => {
        expect(await test.repo.safeFindById(test.newThing2._meta.id)).to.be.null;
    });
});

const typeDefAltIdConfig = {
    typeName: `TestAltIdType_${rand(10)}`,
    alternateIdFields: ["name"],
    fields: { name: {} },
};

describe("Alternate ID test", async () => {
    before((done) => initStorage(done, typeDefAltIdConfig));
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("creates a thing using an alternate id field", async () => {
        const name = rand(20);
        test.newThing = await test.repo.create({ name });
        expect(test.newThing._meta.id).equals(name, "expected newThing.id to be the same as newThing.name");
        expect(test.newThing._meta.id).equals(
            test.newThing._meta.id,
            "expected newThing.id to be the same as newThing.name"
        );
    });
    it("findAll should return an array containing the thing we just created with an alternate id", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(all[0].name).eq(test.newThing.name);
        expect(all[0]._meta.id).eq(test.newThing._meta.id);
        expect(all[0]._meta.version).eq(test.newThing._meta.version);
    });
});

const primaryConfig = {
    typeName: `TestPrimaryType_${rand(10)}`,
    fields: {
        name: {
            primary: true,
            normalize: () => {
                return rand(6);
            },
        },
    },
};

describe("Primary test", async () => {
    before((done) => initStorage(done, primaryConfig));
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("creates a thing using a primary field with a normalize function", async () => {
        const name = rand(3);
        test.newThing = await test.repo.create({ name });
        expect(test.newThing._meta.id).not.equals(
            name,
            `expected newThing.id to be a random value different from ${name}`
        );
        expect(test.newThing.name).not.equals(
            name,
            `expected newThing.name to be a random value different from ${name}`
        );
        expect(test.newThing.name).equals(
            test.newThing._meta.id,
            `expected newThing.name (${test.newThing.name}) === newThing._meta.id (${test.newThing._meta.id})`
        );
        expect(test.newThing._meta.id).equals(
            test.newThing._meta.id,
            "expected newThing.id to be the same as newThing.name"
        );
    });
    it("finds a thing by primary field", async () => {
        const found = await test.repo.findBy("name", test.newThing.name, FIND_FIRST);
        expect(found).is.not.null;
        expect(found?._meta?.id).eq(test.newThing._meta.id);
    });
});
