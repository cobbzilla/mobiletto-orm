const { expect } = require('chai')
const { MobilettoOrmValidationError } = require('../index')
const { initStorage, test, rand } = require('./test-common')

const SOME_DEFAULT_VALUE = rand(10)

const typeDefConfig = {
    typeName: `TestType_${rand(10)}`,
    fields: {
        value: {
            required: true,
            min: 20,
            max: 100,
            updatable: false
        },
        int: {
            minValue: -3,
            maxValue: 500
        },
        comments: {
            control: 'textbox'
        },
        alphaOnly: {
            control: 'password',
            regex: /^[A-Z]+$/gi
        },
        defaultableField: {
            required: true,
            default: SOME_DEFAULT_VALUE
        },
        impliedBoolean: {
            default: false
        },
        restricted: {
            values: [1, 2, 3]
        },
        multiselect: {
            multi: ['option-1', 'option-2', 'option-3', 'option-4']
        }
    }
}

describe('validation test', async () => {
    before(done => initStorage(done, typeDefConfig))
    it("each field should have the correct implied types and controls", async () => {
        const fieldDefs = test.repo.typeDef.fields;
        expect(fieldDefs['id'].type).eq('string')
        expect(fieldDefs['id'].control).eq('label')
        expect(fieldDefs['value'].type).eq('string')
        expect(fieldDefs['value'].control).eq('label')
        expect(fieldDefs['int'].type).eq('number')
        expect(fieldDefs['int'].control).eq('text')
        expect(fieldDefs['comments'].type).eq('string')
        expect(fieldDefs['comments'].control).eq('textbox')
        expect(fieldDefs['alphaOnly'].type).eq('string')
        expect(fieldDefs['alphaOnly'].control).eq('password')
        expect(fieldDefs['defaultableField'].type).eq('string')
        expect(fieldDefs['defaultableField'].control).eq('text')
        expect(fieldDefs['impliedBoolean'].type).eq('boolean')
        expect(fieldDefs['impliedBoolean'].control).eq('flag')
        expect(fieldDefs['restricted'].type).eq('number')
        expect(fieldDefs['restricted'].control).eq('select')
        expect(fieldDefs['multiselect'].type).eq('string')
        expect(fieldDefs['multiselect'].control).eq('multi')
    })
    it("fails to create an object without any required fields", async () => {
        try {
            await test.repo.create({})
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(2, 'expected two errors')
            expect(e.errors['id'].length).equals(1, 'expected 1 id error')
            expect(e.errors['id'][0]).equals('required', 'expected id.required error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('required', 'expected value.required error')
        }
    })
    it("fails to create an object with an illegal id and without one required field", async () => {
        try {
            await test.repo.create({ id: '%'+rand(10) })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(2, 'expected 1 error')
            expect(e.errors['id'].length).equals(1, 'expected 1 id error')
            expect(e.errors['id'][0]).equals('regex', 'expected id.regex error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('required', 'expected value.required error')
        }
    })
    it("fails to create an object with another illegal id and without one required field", async () => {
        try {
            await test.repo.create({ id: '~'+rand(10) })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(2, 'expected 1 error')
            expect(e.errors['id'].length).equals(1, 'expected 1 id error')
            expect(e.errors['id'][0]).equals('regex', 'expected id.regex error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('required', 'expected value.required error')
        }
    })
    it("fails to create an object without one required field", async () => {
        try {
            await test.repo.create({ id: rand(10) })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('required', 'expected value.required error')
        }
    })
    it("fails to create an object with a too-short field", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(10) })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('min', 'expected value.min error')
        }
    })
    it("fails to create an object with a too-long field", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(1000) })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('max', 'expected value.max error')
        }
    })
    it("fails to create an object with a too-small field", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(20), int: -1000 })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['int'].length).equals(1, 'expected 1 int error')
            expect(e.errors['int'][0]).equals('minValue', 'expected int.minValue error')
        }
    })
    it("fails to create an object with a too-large field", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(20), int: 100000 })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['int'].length).equals(1, 'expected 1 int error')
            expect(e.errors['int'][0]).equals('maxValue', 'expected int.maxValue error')
        }
    })
    it("fails to create an object with a regex-failing field", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(20), alphaOnly: '111' })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['alphaOnly'].length).equals(1, 'expected 1 alphaOnly error')
            expect(e.errors['alphaOnly'][0]).equals('regex', 'expected alphaOnly.regex error')
        }
    })
    it("fails to create an object where a value is not one of a specific set", async () => {
        try {
            await test.repo.create({ id: rand(10), value: rand(20), restricted: 42 })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(1, 'expected 1 error')
            expect(e.errors['restricted'].length).equals(1, 'expected 1 restricted error')
            expect(e.errors['restricted'][0]).equals('values', 'expected restricted.values error')
        }
    })
    it("fails to create an object with multiple validation errors", async () => {
        try {
            await test.repo.create({ value: rand(10), int: 100000, alphaOnly: '222' })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(4, 'expected 3 errors')
            expect(e.errors['id'].length).equals(1, 'expected 1 id error')
            expect(e.errors['id'][0]).equals('required', 'expected id.required error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('min', 'expected value.min error')
            expect(e.errors['int'].length).equals(1, 'expected 1 value error')
            expect(e.errors['int'][0]).equals('maxValue', 'expected value.maxValue error')
            expect(e.errors['alphaOnly'].length).equals(1, 'expected 1 alphaOnly error')
            expect(e.errors['alphaOnly'][0]).equals('regex', 'expected alphaOnly.regex error')
        }
    })
    it("fails to create an object with multiple type errors", async () => {
        try {
            await test.repo.create({ id: 1, value: 42, int: 'foo', alphaOnly: false, comments: [], impliedBoolean: 'true', restricted: 'no' })
        } catch (e) {
            expect(e).instanceof(MobilettoOrmValidationError, 'incorrect exception type')
            expect(Object.keys(e.errors).length).equals(7, 'expected 7 errors')
            expect(e.errors['id'].length).equals(1, 'expected 1 id error')
            expect(e.errors['id'][0]).equals('type', 'expected id.type error')
            expect(e.errors['value'].length).equals(1, 'expected 1 value error')
            expect(e.errors['value'][0]).equals('type', 'expected value.type error')
            expect(e.errors['int'].length).equals(1, 'expected 1 value error')
            expect(e.errors['int'][0]).equals('type', 'expected value.type error')
            expect(e.errors['alphaOnly'].length).equals(1, 'expected 1 alphaOnly error')
            expect(e.errors['alphaOnly'][0]).equals('type', 'expected alphaOnly.type error')
            expect(e.errors['comments'].length).equals(1, 'expected 1 comments error')
            expect(e.errors['comments'][0]).equals('type', 'expected comments.type error')
            expect(e.errors['impliedBoolean'].length).equals(1, 'expected 1 impliedBoolean error')
            expect(e.errors['impliedBoolean'][0]).equals('type', 'expected impliedBoolean.type error')
            expect(e.errors['restricted'].length).equals(1, 'expected 1 restricted error')
            expect(e.errors['restricted'][0]).equals('type', 'expected restricted.type error')
        }
    })
    it("successfully creates a valid object, verifying default fields are properly set", async () => {
        const comments = rand(1000)
        const alphaString = 'AbCdEfGh'
        test.newThing = await test.repo.create({
            id: rand(10),
            value: rand(20),
            int: 100,
            alphaOnly: alphaString,
            comments
        });
        expect(test.newThing.int).eq(100)
        expect(test.newThing.comments).eq(comments)
        expect(test.newThing.alphaOnly).eq(alphaString)
        expect(test.newThing.defaultableField).eq(SOME_DEFAULT_VALUE)
        expect(test.newThing.impliedBoolean).eq(false)
        expect(test.newThing.restricted).is.null
    })
    it("successfully updates the object but a non-updatable field will not be updated", async () => {
        const newValue = rand(50)
        const newComments = rand(20)
        const edited = Object.assign({}, test.newThing, { value: newValue, comments: newComments })
        test.updatedThing = await test.repo.update(edited, test.newThing)
        expect(test.updatedThing.int).eq(100)
        expect(test.updatedThing.comments).eq(newComments)
        expect(test.updatedThing.value).eq(test.newThing.value)
    })
    it("confirms that the updated object's non-updatable fields have not been updated", async () => {
        const found = await test.repo.findById(test.newThing.id)
        expect(found.version).eq(test.updatedThing.version)
        expect(found.int).eq(test.updatedThing.int)
        expect(found.comments).eq(test.updatedThing.comments)
        expect(found.value).eq(test.newThing.value)
    })
    it("successfully updates only the comments on the object", async () => {
        const newComments = rand(20)
        const changes = { id: test.updatedThing.id, comments: newComments }
        test.updatedThing = await test.repo.update(changes, test.updatedThing)
        expect(test.newThing.int).eq(100)
        expect(test.updatedThing.comments).eq(newComments)
        expect(test.updatedThing.value).eq(test.newThing.value)
    })
})
