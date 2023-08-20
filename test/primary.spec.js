import { describe, before, it } from "mocha";
import { expect } from "chai";
import { rand } from "mobiletto-orm-typedef";
import { initStorage, test } from "./test-common.js";

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    fields: { value: { primary: true } },
};

const TEST_NAMES = ["simpleName", "name with space", "source:/tmp/slashes/ and spaces"];

describe("primary key test", async () => {
    before((done) => initStorage(done, typeDefConfig));
    it("findAll should return an empty array", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(0);
    });
    it("should create some objects with various IDs", async () => {
        test.primaries = [];
        for (const n of TEST_NAMES) {
            expect(await test.repo.create({ value: n })).is.not.null;
        }
    });
    it("findAll should return all created objects", async () => {
        const all = await test.repo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(TEST_NAMES.length);
    });
    it("should find each created object using findById", async () => {
        for (const n of TEST_NAMES) {
            const found = await test.repo.findById(n);
            expect(found).is.not.null;
            expect(found.value).eq(n);
        }
    });
});
