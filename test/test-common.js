const os = require('os')
const path = require('path')
const fs = require('fs')

require('dotenv').config()

const { mobiletto, closeRedis } = require('mobiletto-lite')
const { repositoryFactory } = require('../index')
const { versionStamp, MobilettoOrmError } = require('mobiletto-orm-typedef')
const { logger } = require('../util/logger')
const randomstring = require('randomstring')

const rand = count => randomstring.generate(count)

const storageConfigs = () => {
    return {
        local1: {
            key: path.join(os.tmpdir(), `mobiletto-orm-test1_${versionStamp()}`)
        },
        local2: {
            key: path.join(os.tmpdir(), `mobiletto-orm-test2_${versionStamp()}`)
        }
    }
}

const getStorages = async () => {
    const storages = []
    const newConfigs = storageConfigs();
    for (const storageName of Object.keys(newConfigs)) {
        const dirName = newConfigs[storageName].key
        fs.mkdirSync(dirName)
        const storage = await mobiletto('local', dirName, '', {})
        storage.name = storageName
        storages.push(storage)
    }
    return storages
}

const initTest = t => {
    t.storages = null
    t.factory = null
    t.repo = null
    t.newThing = null
    t.updatedThing = null
    t.removedThing = null
    t.newThings = []
    t.updatedThings = []
    t.removedThings = []
}

const test = {}
initTest(test)

const initStorage = (done, typeDefConfig) => {
    initTest(test)
    getStorages()
        .then(stores => {
            test.storages = stores
            test.factory = repositoryFactory(test.storages)
            test.repo = test.factory.repository(typeDefConfig)
        })
        .catch(e => {
            console.error(`initStorage error: ${e}`)
            throw e
        })
        .finally(() => done())
}

const splitStorage = (done, typeDefConfig) => {
    initTest(test)
    getStorages()
        .then(stores => {
            test.storages = stores
            test.factories = test.storages.map(s => repositoryFactory([ s ]))
            test.repos = test.factories.map(f => f.repository(typeDefConfig))
            test.mergedFactory = null
            test.buildMergedFactory = () => {
                if (test.mergedFactory == null) {
                    test.mergedFactory = repositoryFactory(test.storages)
                    test.mergedRepo = test.mergedFactory.repository(typeDefConfig)
                }
                return test.mergedFactory
            }
        })
        .catch(e => {
            console.error(`splitStorage error: ${e}`)
            throw e
        })
        .finally(() => done())
}


class MockStorage {
    constructor(storage) {
        this.storage = storage
        this.failing = null
        this.name = storage.name
    }
    fail (message) {
        throw new MobilettoOrmError(message)
    }
    async list (path, opts) {
        if (this.failing) this.fail('list')
        return this.storage.list(path, opts)
    }
    async safeList (path) {
        if (this.failing) return []
        return this.storage.safeList(path)
    }
    async readFile (path) {
        if (this.failing) this.fail('readFile')
        return this.storage.readFile(path)
    }
    async safeReadFile (path) {
        if (this.failing) return null
        return this.storage.safeReadFile(path)
    }
    metadata (path) {
        if (this.failing) this.fail('metadata')
        return this.storage.safeMetadata(path)
    }
    async safeMetadata (path) {
        if (this.failing) return null
        return this.storage.safeMetadata(path)
    }
    async writeFile (path, data) {
        if (this.failing) this.fail('writeFile')
        return this.storage.writeFile(path, data)
    }
    async write (path, data) {
        if (this.failing) this.fail('write')
        return this.storage.write(path, data)
    }
    async remove (path, opts) {
        if (this.failing) this.fail('remove')
        return this.storage.remove(path, opts)
    }
}

const fallibleStorage = (done, typeDefConfig) => {
    initTest(test)
    getStorages()
        .then(stores => {
            test.storages = stores.map(s => new MockStorage(s))
            test.factory = repositoryFactory(test.storages)
            test.repo = test.factory.repository(typeDefConfig)
            test.setFailing = i => test.storages[i].failing = true
            test.unsetFailing = i => test.storages[i].failing = null
        })
        .catch(e => {
            console.error(`initStorage error: ${e}`)
            throw e
        })
        .finally(() => done())
}

after ( (done) => {
    logger.info('all tests finished, tearing down redis...')
    closeRedis().finally(done)
})

module.exports = {
    initStorage, splitStorage, fallibleStorage, test, rand
}
