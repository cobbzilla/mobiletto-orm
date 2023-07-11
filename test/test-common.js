import { after } from "mocha";
import { registerDriver, mobiletto, logger, shutdownMobiletto } from "mobiletto-base";
import { repositoryFactory } from "../lib/esm/index.js";
import { versionStamp, MobilettoOrmError, randomstring } from "mobiletto-orm-typedef";
import { indexedDB } from "fake-indexeddb";

import { storageClient as idbDriver } from "mobiletto-driver-indexeddb";
import { storageClient as localDriver } from "mobiletto-driver-local";
registerDriver("indexeddb", idbDriver);
registerDriver("local", localDriver);

export const rand = (count) => randomstring(count);

export const storageConfigs = () => {
    return {
        local_1: {
            // key: `mobiletto-orm-test1_${versionStamp()}`,
            // opts: { indexedDB },
            key: `/tmp/mobiletto-orm-test1_${versionStamp()}`,
            opts: { createIfNotExist: true },
        },
        local_2: {
            key: `/tmp/mobiletto-orm-test2_${versionStamp()}`,
            opts: { createIfNotExist: true },
        },
        indexeddb_1: {
            key: `idb_${versionStamp()}`,
            opts: { indexedDB },
        },
    };
};

export const getStorages = async () => {
    const storages = [];
    const newConfigs = storageConfigs();
    for (const storageName of Object.keys(newConfigs)) {
        const driverType = storageName.substring(0, storageName.indexOf("_"));
        const config = newConfigs[storageName];
        const dbName = config.key;
        const storage = await mobiletto(driverType, dbName, "", config.opts);
        storage.name = storageName;
        storages.push(storage);
    }
    return storages;
};

export const initTest = (t) => {
    t.storages = null;
    t.factory = null;
    t.repo = null;
    t.newThing = null;
    t.updatedThing = null;
    t.removedThing = null;
    t.newThings = [];
    t.updatedThings = [];
    t.removedThings = [];
};

export const test = {};
initTest(test);

export const initFactory = (done) => {
    initTest(test);
    getStorages()
        .then((stores) => {
            test.storages = stores;
            test.factory = repositoryFactory(test.storages);
        })
        .catch((e) => {
            console.error(`initFactory error: ${e}`);
            throw e;
        })
        .finally(() => done());
};

export const initStorage = (done, typeDefConfig) => {
    initTest(test);
    getStorages()
        .then((stores) => {
            test.storages = stores;
            test.factory = repositoryFactory(test.storages);
            test.repo = test.factory.repository(typeDefConfig);
        })
        .catch((e) => {
            console.error(`initStorage error: ${e}`);
            throw e;
        })
        .finally(() => done());
};

export const splitStorage = (done, typeDefConfig) => {
    initTest(test);
    getStorages()
        .then((stores) => {
            test.storages = stores;
            test.factories = test.storages.map((s) => repositoryFactory([s]));
            test.repos = test.factories.map((f) => f.repository(typeDefConfig));
            test.mergedFactory = null;
            test.buildMergedFactory = () => {
                if (test.mergedFactory == null) {
                    test.mergedFactory = repositoryFactory(test.storages);
                    test.mergedRepo = test.mergedFactory.repository(typeDefConfig);
                }
                return test.mergedFactory;
            };
        })
        .catch((e) => {
            console.error(`splitStorage error: ${e}`);
            throw e;
        })
        .finally(() => done());
};

export class MockStorage {
    constructor(storage) {
        this.storage = storage;
        this.failing = null;
        this.name = storage.name;
    }
    fail(message) {
        throw new MobilettoOrmError(message);
    }
    async list(path, opts) {
        if (this.failing) this.fail("list");
        return this.storage.list(path, opts);
    }
    async safeList(path) {
        if (this.failing) return [];
        return this.storage.safeList(path);
    }
    async readFile(path) {
        if (this.failing) this.fail("readFile");
        return this.storage.readFile(path);
    }
    async safeReadFile(path) {
        if (this.failing) return null;
        return this.storage.safeReadFile(path);
    }
    metadata(path) {
        if (this.failing) this.fail("metadata");
        return this.storage.safeMetadata(path);
    }
    async safeMetadata(path) {
        if (this.failing) return null;
        return this.storage.safeMetadata(path);
    }
    async writeFile(path, data) {
        if (this.failing) this.fail("writeFile");
        return this.storage.writeFile(path, data);
    }
    async write(path, data) {
        if (this.failing) this.fail("write");
        return this.storage.write(path, data);
    }
    async remove(path, opts) {
        if (this.failing) this.fail("remove");
        return this.storage.remove(path, opts);
    }
}

export const fallibleStorage = (done, typeDefConfig) => {
    initTest(test);
    getStorages()
        .then((stores) => {
            test.storages = stores.map((s) => new MockStorage(s));
            test.factory = repositoryFactory(test.storages);
            test.repo = test.factory.repository(typeDefConfig);
            test.setFailing = (i) => (test.storages[i].failing = true);
            test.unsetFailing = (i) => (test.storages[i].failing = null);
        })
        .catch((e) => {
            console.error(`initStorage error: ${e}`);
            throw e;
        })
        .finally(() => done());
};

after((done) => {
    logger.info("all tests finished, tearing down mobiletto...");
    shutdownMobiletto().finally(done);
});
