import { describe, before, it } from "mocha";
import { assert, expect } from "chai";
import { MobilettoOrmNotFoundError, MobilettoOrmValidationError, rand } from "mobiletto-orm-typedef";
import { initStorage, test } from "./test-common.js";

const thingID = "SINGLETON_ID";

describe("singleton test", async () => {
    before((done) =>
        initStorage(done, {
            typeName: `TestType_${rand(10)}`,
            singleton: thingID,
            fields: { value: {} },
        })
    );
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("should create a new singleton thing", async () => {
        const now = Date.now();
        test.newThing = await test.repo.create({ id: thingID, value: rand(10) });
        expect(test.newThing._meta.ctime).greaterThanOrEqual(now, "ctime was too old");
        expect(test.newThing._meta.mtime).equals(
            test.newThing._meta.ctime,
            "mtime was different from ctime on newly created thing"
        );
    });
    it("should fail to create a singleton thing with the same name", async () => {
        try {
            const duplicate = await test.repo.create({ id: thingID, value: rand(10) });
            assert.fail(
                `expected test.repo.create to throw MobilettoOrmValidationError, but it returned ${JSON.stringify(
                    duplicate
                )}`
            );
        } catch (e) {
            expect(e).instanceOf(MobilettoOrmValidationError);
            expect(e.errors.id.length).eq(1);
            expect(e.errors.id[0]).eq("exists");
        }
    });
    it("should fail to create a singleton thing with a different name", async () => {
        try {
            const duplicate = await test.repo.create({ id: thingID + "_different", value: rand(10) });
            assert.fail(
                `expected test.repo.create to throw MobilettoOrmValidationError, but it returned ${JSON.stringify(
                    duplicate
                )}`
            );
        } catch (e) {
            expect(e).instanceOf(MobilettoOrmValidationError);
            expect(e.errors.id.length).eq(1);
            expect(e.errors.id[0]).eq("exists");
        }
    });
    it("findAll should return singleton thing in array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(1);
        expect(test.repo.id(all[0])).eq(thingID);
    });
    it("should find singleton thing by id", async () => {
        const found = await test.repo.findById(thingID);
        expect(found).to.not.be.null;
        expect(test.repo.id(found)).eq(thingID);
    });
    it("should find singleton thing using findSingleton", async () => {
        const found = await test.repo.findSingleton();
        expect(found).to.not.be.null;
        expect(test.repo.id(found)).eq(thingID);
    });
    it("should throw MobilettoOrmNotFoundError when looking up another ID", async () => {
        const nonexistentId = "should not find anything";
        try {
            const found = await test.repo.findById(nonexistentId);
            assert.fail(`expected findById to throw MobilettoOrmNotFoundError but returned ${JSON.stringify(found)}`);
        } catch (e) {
            expect(e).instanceOf(MobilettoOrmNotFoundError);
            expect(e.id).eq(nonexistentId);
        }
    });
});
