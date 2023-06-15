const path = require('path')
const { logger } = require('./util/logger')
const { M_DIR } = require('mobiletto-lite')
const {
    MobilettoOrmTypeDef, versionStamp,
    MobilettoOrmError, MobilettoOrmValidationError,
    MobilettoOrmSyncError, MobilettoOrmNotFoundError
} = require('mobiletto-orm-typedef')

const verifyWrite = async (repository, storages, typeDef, id, obj) => {
    const writePromises = []
    const writeSuccesses = []
    const actualStorages = await resolveStorages(storages);
    const expectedSuccessCount = typeDef.minWrites < 0 ? actualStorages.length : typeDef.minWrites
    const objPath = typeDef.specificPath(obj)
    const objJson = JSON.stringify(obj)
    for (const storage of actualStorages) {
        // write object
        writePromises.push(new Promise(async (resolve, reject) => {
            try {
                const bytesWritten = await storage.writeFile(objPath, objJson)
                if (bytesWritten === objJson.length) {
                    writeSuccesses.push(true)
                    resolve()
                } else {
                    const message = `verifyWrite(${id}): expected to write ${objJson.length} bytes but wrote ${bytesWritten}`
                    const fail = new MobilettoOrmSyncError(id, message)
                    logger.warn(message)
                    resolve(fail)
                }
            } catch (e) {
                logger.warn(`verifyWrite(${id}): error: ${JSON.stringify(e)}`)
                resolve(e)
            }
        }))
        // write index values, if they don't already exist
        for (const fieldName of Object.keys(typeDef.fields)) {
            const field = typeDef.fields[fieldName]
            if (!!(field.index)) {
                const idxPath = typeDef.indexSpecificPath(fieldName, obj)
                writePromises.push(new Promise( async (resolve, reject) => {
                    try {
                        if (await storage.safeMetadata(idxPath) == null) {
                            await storage.writeFile(idxPath, '')
                        }
                        resolve()
                    } catch (e) {
                        logger.warn(`verifyWrite(${id}, index=${idxPath}): error: ${JSON.stringify(e)}`)
                        resolve(e)
                    }
                }))
            }
        }
    }
    await Promise.all(writePromises)

    let failure = null
    if (writeSuccesses.length < expectedSuccessCount) {
        failure = new MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: writeSuccesses.length (${writeSuccesses.length}) < expectedSuccessCount (${expectedSuccessCount})`)

    } else {
        const failedWrites = []
        const confirmedWrites = []
        for (const storage of actualStorages) {
            failedWrites.push(storage.name)
        }
        try {
            const allVersions = await repository.findVersionsById(id)
            for (const storageName of Object.keys(allVersions)) {
                if (storageName in allVersions) {
                    const versions = allVersions[storageName]
                    if (versions.length > 0 && versions[versions.length - 1].object && JSON.stringify(versions[versions.length - 1].object) === objJson) {
                        const idx = failedWrites.indexOf(storageName)
                        if (idx !== -1) {
                            failedWrites.splice(idx, 1)
                        }
                        confirmedWrites.push(storageName)
                    } else {
                        logger.warn(`verifyWrite(${id}): failedWrite to ${storageName}`)
                    }
                }
            }
            if (confirmedWrites.length < expectedSuccessCount) {
                failure = new MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: confirmedWrites.length (${confirmedWrites.length}) < expectedSuccessCount (${expectedSuccessCount})`)
            }
        } catch (e) {
            logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(e)}`)
            failure = new MobilettoOrmSyncError(id, JSON.stringify(e))
        }
    }
    if (failure != null) {
        logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(failure)}`)
        for (const storage of actualStorages) {
            await storage.remove(objPath)
        }
        throw failure
    }
    return obj
}

const parseCurrent = current => {
    if (typeof(current) === 'undefined' || current == null) {
        throw new MobilettoOrmError('no current version provided')
    }
    let version = current;
    if (typeof(current) === 'object') {
        version = current.version
    }
    if (typeof(version) !== 'string') {
        throw new MobilettoOrmError(`expected current version as string (was ${typeof (version)})`)
    }
    return version;
}

async function findVersion(repository, id, current = null) {
    const found = await repository.findById(id)
    const expectedVersion = current == null ? found.version : parseCurrent(current)

    // is the current version what we expected? if not, error
    if (found.version !== expectedVersion) {
        throw new MobilettoOrmSyncError(id, `expected version ${expectedVersion} but found ${found.version}`)
    }
    return found
}

function includeRemovedThing(includeRemoved, thing) {
    return includeRemoved ||
        (typeof (thing.removed) === 'undefined' ||
            (typeof (thing.removed) === 'boolean' && thing.removed !== true));
}

const resolveStorages = async stores => {
    if (Array.isArray(stores)) return stores
    if (typeof(stores) === 'function') {
        return await stores()
    }
}

const repo = (storages, typeDefOrConfig) => {
    const typeDef = typeDefOrConfig instanceof MobilettoOrmTypeDef
        ? typeDefOrConfig
        : new MobilettoOrmTypeDef(typeDefOrConfig)
    const repository = {
        typeDef,
        async create (thing) {
            // validate fields
            const obj = typeDef.validate(thing)

            // does thing with PK exist? if so, error
            const id = typeDef.id(obj)
            let found = null
            try {
                found = await repository.findById(id)
            } catch (e) {
                if (e instanceof MobilettoOrmNotFoundError) {
                    // expected
                } else {
                    throw e
                }
            }
            if (found != null) {
                throw new MobilettoOrmValidationError({ id: ['exists'] })
            }

            // save thing, then read current version: is it what we just wrote? if not then error
            obj.ctime = obj.mtime = Date.now()
            return await verifyWrite(repository, storages, typeDef, id, obj)
        },
        async update (editedThing, current) {
            if (typeof(current) === 'undefined' || current == null) {
                throw new MobilettoOrmSyncError(editedThing.id, 'update: current version is required')
            }

            // does thing with PK exist? if not, error
            const id = typeDef.id(editedThing)
            const found = await findVersion(repository, id, current);

            // validate fields
            const obj = typeDef.validate(editedThing, found)

            if (typeof(obj.version) === 'undefined' || !obj.version || found.version === obj.version) {
                obj.version = versionStamp()
            }

            // remove old indexes
            const indexCleanups = []
            for (const fieldName of Object.keys(typeDef.fields)) {
                const field = typeDef.fields[fieldName]
                if (!!(field.index) && typeof(found[fieldName]) !== 'undefined') {
                    const idxPath = typeDef.indexSpecificPath(fieldName, found)
                    for (const storage of await resolveStorages(storages)) {
                        indexCleanups.push(storage.remove(idxPath))
                    }
                }
            }
            await Promise.all(indexCleanups)

            // update thing, then read current version: is it what we just wrote? if not, error
            const now = Date.now();
            if (typeof(obj.ctime) !== 'number' || obj.ctime < 0) {
                obj.ctime = now
            }
            if (typeof(obj.mtime) !== 'number' || obj.mtime < obj.ctime) {
                obj.mtime = now
            }
            const toWrite = Object.assign({}, found, obj)
            return await verifyWrite(repository, storages, typeDef, id, toWrite)
        },
        async remove (id, current = null) {
            // is there a thing that matches current? if not, error
            const found = await findVersion(repository, id, current)

            // write tombstone record, then read current version: is it what we just wrote? if not, error
            const tombstone = typeDef.tombstone(found)
            return await verifyWrite(repository, storages, typeDef, id, tombstone)
        },
        async exists (id) {
            return this.findById(id, { exists: true })
        },
        async safeFindById (id, opts = null) {
            try {
                return await this.findById(id, opts)
            } catch (e) {
                return null
            }
        },
        async findById (id, opts = null) {
            const objPath = typeDef.generalPath(id)
            const listPromises = []
            const found = {}
            const absent = []
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                listPromises.push(new Promise(async (resolve, reject) => {
                    try {
                        const files = await storage.safeList(objPath)
                        if (files && files.length > 0) {
                            files
                                .filter(f => f.name && typeDef.isSpecificPath(f.name))
                                .sort((f1, f2) => f1.name.localeCompare(f2.name))
                            const data = await storage.safeReadFile(files[files.length - 1].name)
                            const object = JSON.parse(data)
                            if (!includeRemovedThing(includeRemoved, object)) {
                                return resolve(null)
                            }
                            found[storage.name] = {
                                storage, data, object,
                                name: path.basename(files[files.length - 1].name)
                            }
                            // clean up excess versions
                            if (files.length > typeDef.maxVersions) {
                                for (let i = 0; i < files.length - typeDef.maxVersions + 1; i++) {
                                    storage.remove(files[i].name)
                                }
                            }
                        } else {
                            absent.push(storage)
                        }
                        resolve(found[storage.name])
                    } catch (e) {
                        logger.error(`findById(${id}): ${e}`)
                        resolve(e)
                    }
                }))
            }
            await Promise.all(listPromises)
            const checkExistsOnly = opts && typeof(opts.exists) === 'boolean' && opts.exists === true;
            if (Object.keys(found).length === 0) {
                if (checkExistsOnly) {
                    return false
                }
                throw new MobilettoOrmNotFoundError(id)

            } else if (checkExistsOnly) {
                return true
            }

            const sortedFound = Object.values(found).sort((f1, f2) => f1.name && f2.name ? f1.name.localeCompare(f2.name) : 0)

            // sync: update older/missing versions to the newest version
            const newest = sortedFound[sortedFound.length - 1]
            const newestObj = JSON.parse(newest.data)
            const newestJson = JSON.stringify(newestObj)
            const newestPath = typeDef.specificPath(newestObj);
            const syncPromises = []
            for (let i = 0; i < sortedFound.length - 1; i++) {
                const f = sortedFound[i]
                if (newestJson !== JSON.stringify(f.object)) {
                    syncPromises.push(new Promise((resolve) => {
                        try {
                            resolve(f.storage.writeFile(newestPath, newest.data))
                        } catch (e) {
                            logger.warn(`findById: storage[${f.storage.name}].writeFile(${newestPath}) failed: ${e}`)
                            resolve(e)
                        }
                    }))
                }
            }
            for (const missing of absent) {
                syncPromises.push(new Promise((resolve, reject) => {
                    try {
                        resolve(missing.writeFile(newestPath, newest.data))
                    } catch (e) {
                        logger.warn(`findById: storage[${missing.name}].writeFile(${newestPath}) failed: ${e}`)
                        resolve()
                    }
                }))
            }
            try {
                await Promise.all(syncPromises)
            } catch (e) {
                logger.warn(`findById: error resolving syncPromises: ${e}`)
            }
            return newestObj
        },
        async find (predicate, opts = null) {
            const typePath = typeDef.typePath()
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)

            // read all things concurrently
            const promises = []
            const found = {}
            for (const storage of await resolveStorages(storages)) {
                promises.push(new Promise(async (resolve, reject) => {
                    try {
                        const typeList = await storage.safeList(typePath)
                        for (const dir of typeList) {
                            if (dir.type === M_DIR) {
                                promises.push(new Promise(async (resolve2, reject2) => {
                                    try {
                                        // find the latest version of each distinct thing
                                        let thing = null
                                        const id = path.basename(dir.name)
                                        if (typeof(found[id]) === 'undefined') {
                                            found[id] = null
                                            try {
                                                thing = await repository.findById(id, { removed: includeRemoved })
                                            } catch (e3) {
                                                logger.warn(`find: findById(${id}): ${e3}`)
                                            }
                                            // does the thing match the predicate? if so, include in results
                                            // removed things are only included if opts.removed was set
                                            if (thing && predicate(thing) && includeRemovedThing(includeRemoved, thing)) {
                                                found[id] = thing
                                            }
                                        }
                                        resolve2(thing)
                                    } catch (e2) {
                                        reject2(e2)
                                    }
                                }))
                            }
                        }
                        resolve()
                    } catch (e) {
                        reject(e)
                    }
                }))
            }
            await Promise.all(promises)
            const resolved = await Promise.all(promises);
            if (resolved.length !== promises.length) {
                logger.warn(`find: ${resolved} of ${promises.length} promises resolved`)
            }
            return Object.values(found).filter(f => f != null)
        },
        async safeFindBy(field, value, opts = null) {
            const first = opts && typeof(opts.first) && opts.first === true
            try {
                return await this.findBy(field, value, opts)
            } catch (e) {
                logger.warn(`safeFindBy(${field}) threw ${e}`)
                return first ? null : []
            }
        },
        async findBy (field, value, opts = null) {
            const idxPath = typeDef.indexPath(field, value)
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)
            const exists = (opts && typeof(opts.exists) === 'boolean' && opts.exists === true)
            const first = (opts && typeof(opts.first) === 'boolean' && opts.first === true)

            // read all things concurrently
            const promises = []
            const found = {}
            let addedAnything = false
            for (const storage of await resolveStorages(storages)) {
                if ((exists || first) && addedAnything) {
                    break
                }
                promises.push(new Promise(async (resolve, reject) => {
                    try {
                        if ((exists || first) && addedAnything) {
                            resolve()
                        }
                        const indexEntries = await storage.safeList(idxPath)
                        for (const entry of indexEntries) {
                            const id = typeDef.idFromPath(entry.name)
                            if (typeof(found[id]) === 'undefined') {
                                found[id] = null
                                const thing = await repository.findById(id)
                                if (includeRemovedThing(includeRemoved, thing)) {
                                    found[id] = thing
                                    if (exists || first) {
                                        addedAnything = true
                                        resolve()
                                    }
                                }
                            }
                        }
                        resolve()
                    } catch (e) {
                        reject(e)
                    }
                }))
            }
            await Promise.all(promises)
            const foundValues = Object.values(found).filter(v => v != null)
            if (exists) {
                return foundValues.length > 0
            }
            if (first) {
                return foundValues.length > 0 ? foundValues[0] : null
            }
            return foundValues
        },
        async findVersionsById (id) {
            const objPath = typeDef.generalPath(id)
            const promises = []
            const dataPromises = []
            const found = {}

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                promises.push(new Promise(async (resolve, reject) => {
                    try {
                        const files = await storage.safeList(objPath)
                        if (files && files.length > 0) {
                            files
                                .filter(f => f.name && typeDef.isSpecificPath(f.name))
                                .sort((f1, f2) => f1.name.localeCompare(f2.name))
                                .map(f => {
                                    dataPromises.push(new Promise(async (resolve2, reject2) => {
                                        try {
                                            f.data = await storage.safeReadFile(f.name)
                                            f.object = f.data ? JSON.parse(f.data) : null
                                            resolve2(f)
                                        } catch (e2) {
                                            logger.warn(`findVersionsById(${id}): safeReadFile error ${e2}`)
                                            reject2(e2)
                                        }
                                    }))
                                })
                            found[storage.name] = files
                        }
                        resolve()
                    } catch (e) {
                        logger.error(`findVersionsById(${id}): ${e}`)
                        reject(e)
                    }
                }))
            }
            await Promise.all(promises)
            await Promise.all(dataPromises)
            return found
        },
        async findAll (opts = null) {
            return repository.find(() => true, opts)
        },
        async findAllIncludingRemoved () {
            return repository.find(() => true, { removed: true })
        }
    }
    return repository
}

const repositoryFactory = (storages) => {
    return {
        storages,
        repository: typeDef => repo(storages, typeDef)
    }
}

module.exports = {
    repositoryFactory,
    // re-export mobiletto-orm-typedef exports
    versionStamp,
    MobilettoOrmTypeDef,
    MobilettoOrmError,
    MobilettoOrmNotFoundError,
    MobilettoOrmSyncError,
    MobilettoOrmValidationError
}
