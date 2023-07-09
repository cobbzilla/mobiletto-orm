import { describe, before, it } from "mocha";
import { expect } from "chai";
import { splitStorage, test, rand } from "./test-common.js";

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    fields: { value: {} },
};

describe("storage management test", async () => {
    before((done) => splitStorage(done, typeDefConfig));
    it("findAll should return an empty array for each repo", async () => {
        for (const repo of test.repos) {
            const all = await repo.findAll();
            expect(all).to.not.be.null;
            expect(all.length).eq(0);
        }
    });
    it("create a thing in each repo", async () => {
        for (let i = 0; i < test.repos.length; i++) {
            const repo = test.repos[i];
            test.newThings.push(await repo.create({ id: `Test_${i}_${rand(10)}`, value: rand(10) }));
        }
    });
    it("findAll returns one different thing from each repo", async () => {
        for (let i = 0; i < test.repos.length; i++) {
            const repo = test.repos[i];
            const all = await repo.findAll();
            expect(all).to.not.be.null;
            expect(all.length).eq(1);
            expect(all.filter((f) => f.id.startsWith(`Test_${i}_`)).length).eq(1);
        }
    });
    it("findAll returns all the things in merged storage", async () => {
        test.buildMergedFactory();
        const all = await test.mergedRepo.findAll();
        expect(all).to.not.be.null;
        expect(all.length).eq(test.repos.length);
        for (let i = 0; i < test.repos.length; i++) {
            expect(all.filter((f) => f.id.startsWith(`Test_${i}_`)).length).eq(1);
        }
    });
    it("findAll returns all the things from individual storage, after merge query", async () => {
        for (let i = 0; i < test.repos.length; i++) {
            const repo = test.repos[i];
            const all = await repo.findAll();
            expect(all).to.not.be.null;
            expect(all.length).eq(test.repos.length);
            for (let j = 0; j < test.repos.length; j++) {
                expect(all.filter((f) => f.id.startsWith(`Test_${j}_`)).length).eq(1);
            }
        }
    });
});
