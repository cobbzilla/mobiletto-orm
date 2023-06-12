const path = require('path')
const shasum = require('shasum')
const randomstring = require('randomstring')
const { logger } = require('./util/logger')
const { M_DIR } = require('mobiletto-lite')

const MAX_VERSIONS = 5

function MobilettoOrmError (message, err) {
    this.message = `${message}: ${err ? err : ''}`
    // noinspection JSUnusedGlobalSymbols
    this.err = err
    // Use V8's native method if available, otherwise fallback
    if ('captureStackTrace' in Error) {
        Error.captureStackTrace(this, TypeError)
    } else {
        // noinspection JSUnusedGlobalSymbols
        this.stack = (new Error(this.message)).stack
    }
    MobilettoOrmError.prototype.toString = () => JSON.stringify(this)
}

function MobilettoOrmNotFoundError (id) {
    this.message = `MobilettoOrmNotFoundError: ${id}`
    this.id = id
    // Use V8's native method if available, otherwise fallback
    if ('captureStackTrace' in Error) {
        Error.captureStackTrace(this, TypeError)
    } else {
        // noinspection JSUnusedGlobalSymbols
        this.stack = (new Error(this.message)).stack
    }
    MobilettoOrmNotFoundError.prototype.toString = () => JSON.stringify(this)
}

function MobilettoOrmSyncError (id, message) {
    this.message = message ? message : `MobilettoOrmSyncError: ${id}`
    this.id = id
    // Use V8's native method if available, otherwise fallback
    if ('captureStackTrace' in Error) {
        Error.captureStackTrace(this, TypeError)
    } else {
        // noinspection JSUnusedGlobalSymbols
        this.stack = (new Error(this.message)).stack
    }
    MobilettoOrmSyncError.prototype.toString = () => JSON.stringify(this)
}

function MobilettoOrmValidationError (errors) {
    this.errors = errors
    this.message = JSON.stringify(errors)

    // Use V8's native method if available, otherwise fallback
    if ('captureStackTrace' in Error) {
        Error.captureStackTrace(this, TypeError)
    } else {
        // noinspection JSUnusedGlobalSymbols
        this.stack = (new Error(this.message)).stack
    }
    MobilettoOrmValidationError.prototype.toString = () => JSON.stringify(this)
}

const normalizeId = fsSafeName

const verifyWrite = async (repository, storages, typeDef, id, obj) => {
    const writePromises = []
    const objPath = typeDef.specificPath(obj)
    const objJson = JSON.stringify(obj)
    for (const storage of storages) {
        // write object
        writePromises.push(storage.writeFile(objPath, objJson))
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
                        reject(e)
                    }
                }))
            }
        }
    }
    await Promise.all(writePromises)

    const readPromises = []
    const failedWrites = []
    for (const storage of storages) {
        failedWrites.push(storage.name)
    }
    for (const storage of storages) {
        readPromises.push(new Promise(async (resolve, reject) => {
            try {
                const found = await repository.findById(id, { removed: true })
                if (JSON.stringify(found) !== objJson) {
                    logger.warn(`verifyWrite: failedWrite to ${storage.name}`)
                } else {
                    const idx = failedWrites.indexOf(storage.name)
                    if (idx !== -1) {
                        failedWrites.splice(idx, 1)
                    }
                }
                resolve(found)
            } catch (e) {
                logger.error(`verifyWrite error: ${e}`)
                reject(new MobilettoOrmSyncError(id, JSON.stringify(e)))
            }
        }))
    }
    await Promise.all(readPromises)

    if (failedWrites.length > 0) {
        // if not, delete our version and error out
        for (const storage of storages) {
            await storage.remove(objPath)
        }
        throw new MobilettoOrmSyncError(id, `verifyWrite: failed write: ${id}`)
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

const VERSION_SUFFIX_RAND_LEN = 16;
const versionStamp = () => `_${Date.now()}_${randomstring.generate(VERSION_SUFFIX_RAND_LEN)}`
const MIN_VERSION_STAMP_LENGTH = versionStamp().length
const OBJ_ID_SEP = '_MORM_'

const FIELD_VALIDATIONS = {
    required: (val, req) => !req || (typeof(val) !== 'undefined' && val != null && (typeof(val) !== 'string' || val.length > 0)),
    min: (val, limit) => val == null || typeof(val) === 'string' && val.length >= limit,
    max: (val, limit) => val == null || typeof(val) === 'string' && val.length <= limit,
    minValue: (val, limit) => val == null || (typeof(val) === 'number' && val >= limit),
    maxValue: (val, limit) => val == null || (typeof(val) === 'number' && val <= limit),
    regex: (val, rx) => val == null || !!val.match(rx)
}

const DEFAULT_FIELDS = {
    id: {
        required: true,
        updatable: false,
        normalize: normalizeId,
        regex: /^[^%~]+$/gi
    }
}

function fsSafeName(name) {
    return encodeURIComponent(name).replaceAll('%', '~');
}

class MobilettoOrmTypeDef {
    constructor(config) {
        if (typeof(config.typeName) !== 'string' || config.typeName.length <= 0) {
            throw new MobilettoOrmError('invalid TypeDefConfig: no typeName provided')
        }
        if (config.typeName.includes('%') || config.typeName.includes('~')) {
            throw new MobilettoOrmError('invalid TypeDefConfig: typeName cannot contain % or ~ characters')
        }
        this.typeName = fsSafeName(config.typeName)
        this.basePath = config.basePath || ''
        this.fields = Object.assign({}, config.fields, DEFAULT_FIELDS)
        this.maxVersions = config.maxVersions || MAX_VERSIONS
        this.specificPathRegex  = new RegExp(`^${this.typeName}_[A-Z\\d-]+${OBJ_ID_SEP}_\\d{13,}_[A-Z\\d]{${VERSION_SUFFIX_RAND_LEN},}\\.json$`, 'gi')
        this.validators = Object.assign({}, FIELD_VALIDATIONS, config.validators || {})
    }
    validate (thing, current) {
        const isCreate = typeof(current) === 'undefined'
        if (typeof(thing.version) !== 'string' || thing.version.length < MIN_VERSION_STAMP_LENGTH) {
            thing.version = versionStamp()
        }
        const now = Date.now()
        if (typeof(thing.ctime) !== 'number' || thing.ctime < 0) {
            thing.ctime = now
        }
        if (typeof(thing.mtime) !== 'number' || thing.mtime < thing.ctime) {
            thing.mtime = now
        }
        const errors = {}
        const validated = {
            id: thing.id,
            version: thing.version,
            ctime: thing.ctime,
            mtime: thing.mtime
        }
        for (const fieldName of Object.keys(this.fields)) {
            const field = this.fields[fieldName]
            const updatable = typeof (field.updatable) === 'undefined' || !!field.updatable;
            if (isCreate || updatable) {
                for (const validator of Object.keys(this.validators)) {
                    if (typeof(field[validator]) !== 'undefined') {
                        if (!this.validators[validator](thing[fieldName], field[validator])) {
                            if (typeof(errors[fieldName]) === 'undefined') {
                                errors[fieldName] = []
                            }
                            errors[fieldName].push(validator)
                        }
                    }
                }
                if (typeof(errors[fieldName]) === 'undefined') {
                    let fieldValue = null
                    if (isCreate && typeof(field.default) !== 'undefined' && (typeof(thing[fieldName]) !== 'string' || thing[fieldName].length === 0)) {
                        fieldValue = field.default
                    } else {
                        fieldValue = thing[fieldName]
                    }
                    if (field.normalize) {
                        validated[fieldName] = field.normalize(fieldValue)
                    } else {
                        validated[fieldName] = fieldValue
                    }
                }
            }
        }
        if (Object.keys(errors).length > 0) {
            throw new MobilettoOrmValidationError(errors)
        }
        return validated
    }
    id (thing) {
        return normalizeId(thing.id)
    }

    typePath () { return (this.basePath.length > 0 ? this.basePath + '/' : '') + this.typeName }

    generalPath (id) {
        const idVal = (typeof(id) === 'object' && id.id && typeof(id.id) === 'string')
            ? id.id
            : typeof(id) === 'string' && id.length > 0 ? id : null
        if (idVal == null) {
            throw new MobilettoOrmError(`typeDef.generalPath: invalid id: ${id}`)
        }
        return this.typePath() + '/' + idVal
    }

    isSpecificPath (p) {
        return path.basename(p).match(this.specificPathRegex)
    }

    specificBasename (obj) {
        return this.typeName + '_' + obj.id + OBJ_ID_SEP + obj.version + '.json'
    }

    idFromPath (p) {
        // start with basename
        let base = path.basename(p)

        // chop type prefix
        if (!base.startsWith(this.typeName + '_')) {
            throw new MobilettoOrmError(`idFromPath: invalid path: ${p}`)
        }
        base = base.substring(this.typeName.length + 1)

        // find OBJ_ID_SEP
        const idSep = base.indexOf(OBJ_ID_SEP)
        if (idSep === -1) {
            throw new MobilettoOrmError(`idFromPath: invalid path: ${p}`)
        }

        // ID is everything until the separator
        return base.substring(0, idSep)
    }

    specificPath (obj) {
        return this.generalPath(obj.id) + '/' + this.specificBasename(obj)
    }

    indexPath (field, value) {
        if (this.fields[field] && !!(this.fields[field].index)) {
            return `${this.typePath()}_idx_${shasum(field)}/${shasum(value)}`
        } else {
            throw new MobilettoOrmError(`typeDef.indexPath: field not indexed: ${field}`)
        }
    }

    indexSpecificPath (field, obj) {
        return `${this.indexPath(field, obj[field])}/${this.specificBasename(obj)}`
    }

    tombstone(thing) {
        return {
            id: thing.id,
            version: versionStamp(),
            removed: true,
            ctime: thing.ctime,
            mtime: Date.now()
        }
    }
}

function includeRemovedThing(includeRemoved, thing) {
    return includeRemoved ||
        (typeof (thing.removed) === 'undefined' ||
            (typeof (thing.removed) === 'boolean' && thing.removed !== true));
}

const repo = (storages, typeDefConfig) => {
    const typeDef = new MobilettoOrmTypeDef(typeDefConfig)
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

            // validate fields
            const obj = typeDef.validate(editedThing, current)

            // does thing with PK exist? if not, error
            const id = typeDef.id(obj)
            const found = await findVersion(repository, id, current);
            if (typeof(obj.version) === 'undefined' || !obj.version || found.version === obj.version) {
                obj.version = versionStamp()
            }

            // remove old indexes
            const indexCleanups = []
            for (const fieldName of Object.keys(typeDef.fields)) {
                const field = typeDef.fields[fieldName]
                if (!!(field.index) && typeof(found[fieldName]) !== 'undefined') {
                    const idxPath = typeDef.indexSpecificPath(fieldName, found)
                    for (const storage of storages) {
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
        async findById (id, opts = null) {
            const objPath = typeDef.generalPath(id)
            const listPromises = []
            const found = {}
            const absent = []
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)

            // read current version from each storage
            for (const storage of storages) {
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
                                for (let i = 0; i < files.length - typeDef.maxVersions; i++) {
                                    storage.remove(files[i].name)
                                }
                            }
                        } else {
                            absent.push(storage)
                        }
                        resolve(found[storage.name])
                    } catch (e) {
                        logger.error(`findById(${id}): ${e}`)
                        reject(e)
                    }
                }))
            }
            await Promise.all(listPromises)
            if (Object.keys(found).length === 0) {
                throw new MobilettoOrmNotFoundError(id)
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
                    syncPromises.push(f.storage.writeFile(newestPath, newest.data))
                }
            }
            for (const missing of absent) {
                syncPromises.push(missing.writeFile(newestPath, newest.data))
            }
            await Promise.all(syncPromises)

            return newestObj
        },
        async find (predicate, opts = null) {
            const typePath = typeDef.typePath()
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)

            // read all things concurrently
            const promises = []
            const found = {}
            for (const storage of storages) {
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
        async findBy (field, value, opts = null) {
            const idxPath = typeDef.indexPath(field, value)
            const includeRemoved = !!(opts && opts.removed && opts.removed === true)

            // read all things concurrently
            const promises = []
            const found = {}
            for (const storage of storages) {
                promises.push(new Promise(async (resolve, reject) => {
                    try {
                        const indexEntries = await storage.safeList(idxPath)
                        for (const entry of indexEntries) {
                            const id = typeDef.idFromPath(entry.name)
                            if (typeof(found[id]) === 'undefined') {
                                found[id] = null
                                const thing = await repository.findById(id)
                                if (includeRemovedThing(includeRemoved, thing)) {
                                    found[id] = thing
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
            return Object.values(found).filter(v => v != null)
        },
        async findVersionsById (id) {
            const objPath = typeDef.generalPath(id)
            const promises = []
            const dataPromises = []
            const found = {}

            // read current version from each storage
            for (const storage of storages) {
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
    versionStamp,
    MobilettoOrmError,
    MobilettoOrmNotFoundError,
    MobilettoOrmSyncError,
    MobilettoOrmValidationError
}
