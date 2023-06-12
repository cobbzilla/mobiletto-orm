const os = require('os')
const path = require('path')
const fs = require('fs')

require('dotenv').config()

const { mobiletto, closeRedis } = require('mobiletto-lite')
const { versionStamp, repositoryFactory } = require("../index");
const { logger } = require("../util/logger");
const randomstring = require("randomstring");

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

after ( (done) => {
    logger.info('all tests finished, tearing down redis...')
    closeRedis().finally(done)
})

module.exports = {
    initStorage, splitStorage, test, rand
}
