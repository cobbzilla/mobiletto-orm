import { describe, before, it } from "mocha";
import { expect } from "chai";
import { initStorage, test } from "./test-common.js";
import { ERR_REF_NOT_FOUND, ERR_REQUIRED, MobilettoOrmValidationError, rand } from "mobiletto-orm-typedef";

const departmentTypeDefConfig = {
    typeName: `Department`,
    fields: {
        name: {
            primary: true,
        },
    },
};

const employeeTypeDefConfig = {
    typeName: `Employee`,
    fields: {
        name: {
            primary: true,
        },
        departments: {
            type: "string[]",
            control: "multi",
            required: true,
            ref: {
                refType: "Department",
            },
        },
    },
};

describe("references test", async () => {
    before((done) => initStorage(done, departmentTypeDefConfig, employeeTypeDefConfig));
    it("should add some departments", async () => {
        test.departmentNames = [];
        for (let i = 0; i < 5; i++) {
            const name = `Department_${rand(4)}`;
            test.departmentNames.push(name);
            expect((await test.repo.create({ name })).name).eq(name);
        }
    });
    it("should fail to add an employee with no departments", async () => {
        try {
            const name = `Employee_${rand(4)}`;
            await test.repo2.create({ name });
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError);
            expect(e.errors.departments[0]).eq(ERR_REQUIRED);
        }
    });
    it("should fail to add an employee with an empty departments array", async () => {
        try {
            const name = `Employee_${rand(4)}`;
            await test.repo2.create({ name, departments: [] });
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError);
            expect(e.errors.departments[0]).eq(ERR_REQUIRED);
        }
    });
    it("should fail to add an employee with an invalid department", async () => {
        try {
            const name = `Employee_${rand(4)}`;
            await test.repo2.create({ name, departments: ["non-existent"] });
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError);
            expect(e.errors.departments[0]).eq(ERR_REF_NOT_FOUND);
        }
    });
    it("should successfully add an employee with all departments", async () => {
        const name = `Employee_${rand(4)}`;
        await test.repo2.create({ name, departments: test.departmentNames });
    });
    it("should successfully add an employee with one department", async () => {
        const name = `Employee_${rand(4)}`;
        await test.repo2.create({ name, departments: [test.departmentNames[0]] });
    });
    it("should fail add an employee with some valid and some invalid departments", async () => {
        try {
            const name = `Employee_${rand(4)}`;
            await test.repo2.create({ name, departments: [test.departmentNames[0], "invalid-department"] });
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError);
            expect(e.errors.departments[0]).eq(ERR_REF_NOT_FOUND);
        }
    });
});
