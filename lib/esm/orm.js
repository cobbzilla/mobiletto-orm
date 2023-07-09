var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import path from "path";
import { M_DIR, logger } from "mobiletto-base";
import { MobilettoOrmTypeDef, versionStamp, MobilettoOrmValidationError, MobilettoOrmSyncError, MobilettoOrmNotFoundError, MobilettoOrmError, } from "mobiletto-orm-typedef";
import { findVersion, includeRemovedThing, promiseFindById, resolveStorages, verifyWrite, } from "./util.js";
const repo = (storages, typeDefOrConfig) => {
    const typeDef = typeDefOrConfig instanceof MobilettoOrmTypeDef ? typeDefOrConfig : new MobilettoOrmTypeDef(typeDefOrConfig);
    const repository = {
        typeDef,
        validate(thing, current) {
            return __awaiter(this, void 0, void 0, function* () {
                return typeDef.validate(thing, current);
            });
        },
        id(thing) {
            return typeDef.id(thing);
        },
        idField(thing) {
            return typeDef.idField(thing);
        },
        create(thing) {
            return __awaiter(this, void 0, void 0, function* () {
                // validate fields
                const obj = yield typeDef.validate(thing);
                // does thing with PK exist? if so, error
                const id = typeDef.id(obj);
                if (!id) {
                    throw new MobilettoOrmNotFoundError(typeof obj !== "undefined" ? JSON.stringify(obj) : "undefined");
                }
                let found = null;
                try {
                    found = yield repository.findById(id);
                }
                catch (e) {
                    if (e instanceof MobilettoOrmNotFoundError) {
                        // expected
                    }
                    else {
                        throw e;
                    }
                }
                if (found != null) {
                    throw new MobilettoOrmValidationError({ id: ["exists"] });
                }
                // save thing, then read current version: is it what we just wrote? if not then error
                obj.ctime = obj.mtime = Date.now();
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, id, obj));
            });
        },
        update(editedThing, current) {
            return __awaiter(this, void 0, void 0, function* () {
                if (typeof current === "undefined" || current == null) {
                    throw new MobilettoOrmSyncError(editedThing.id, "update: current version is required");
                }
                // does thing with PK exist? if not, error
                const id = typeDef.id(editedThing);
                if (!id) {
                    throw new MobilettoOrmSyncError(editedThing.id, "update: error determining id");
                }
                const found = yield findVersion(repository, id, current);
                // validate fields
                const obj = yield typeDef.validate(editedThing, found);
                if (typeof obj.version === "undefined" || !obj.version || found.version === obj.version) {
                    obj.version = versionStamp();
                }
                // remove old indexes
                const indexCleanups = [];
                for (const fieldName of Object.keys(typeDef.fields)) {
                    const field = typeDef.fields[fieldName];
                    if (!!field.index && typeof found[fieldName] !== "undefined") {
                        const idxPath = typeDef.indexSpecificPath(fieldName, found);
                        for (const storage of yield resolveStorages(storages)) {
                            indexCleanups.push(storage.remove(idxPath));
                        }
                    }
                }
                yield Promise.all(indexCleanups);
                // update thing, then read current version: is it what we just wrote? if not, error
                const now = Date.now();
                if (typeof obj.ctime !== "number" || obj.ctime < 0) {
                    obj.ctime = now;
                }
                if (typeof obj.mtime !== "number" || obj.mtime < obj.ctime) {
                    obj.mtime = now;
                }
                const toWrite = Object.assign({}, found, obj);
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, id, toWrite));
            });
        },
        remove(id, current) {
            return __awaiter(this, void 0, void 0, function* () {
                // is there a thing that matches current? if not, error
                const found = yield findVersion(repository, id, current);
                // write tombstone record, then read current version: is it what we just wrote? if not, error
                const tombstone = typeDef.tombstone(found);
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, found.id, tombstone, found));
            });
        },
        purge(idVal) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal);
                const found = yield this.findById(id, { removed: true });
                if (!typeDef.isTombstone(found)) {
                    throw new MobilettoOrmSyncError(idVal);
                }
                const objPath = typeDef.generalPath(id);
                const deletePromises = [];
                for (const storage of yield resolveStorages(storages)) {
                    deletePromises.push(new Promise((resolve, reject) => {
                        storage
                            .remove(objPath, { recursive: true })
                            .then((result) => resolve(result))
                            .catch((e) => {
                            reject(e);
                        });
                    }));
                }
                return yield Promise.all(deletePromises);
            });
        },
        exists(id) {
            return __awaiter(this, void 0, void 0, function* () {
                return !!(yield this.findById(id, { exists: true }));
            });
        },
        safeFindById(id, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    return yield this.findById(id, opts);
                }
                catch (e) {
                    return null;
                }
            });
        },
        resolveId(idVal) {
            idVal = typeof idVal === "object" ? typeDef.id(idVal) : idVal;
            return typeDef.fields && typeDef.fields.id && typeof typeDef.fields.id.normalize === "function"
                ? typeDef.fields.id.normalize(idVal)
                : idVal;
        },
        findById(idVal, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal);
                const objPath = typeDef.generalPath(id);
                const listPromises = [];
                const found = {};
                const absent = [];
                const removed = !!(opts && opts.removed && opts.removed === true);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
                // read current version from each storage
                for (const storage of yield resolveStorages(storages)) {
                    listPromises.push(new Promise((resolve) => {
                        // try {
                        storage.safeList(objPath).then((files) => {
                            if (files && files.length > 0) {
                                files
                                    .filter((f) => f.name && typeDef.isSpecificPath(f.name))
                                    .sort((f1, f2) => f1.name.localeCompare(f2.name));
                                const mostRecentFile = files[files.length - 1].name;
                                storage
                                    .safeReadFile(mostRecentFile)
                                    .then((data) => {
                                    if (!data) {
                                        resolve();
                                        return;
                                    }
                                    const object = noRedact
                                        ? JSON.parse(data.toString("utf8"))
                                        : typeDef.redact(JSON.parse(data.toString("utf8")));
                                    if (!includeRemovedThing(removed, object)) {
                                        resolve();
                                        return;
                                    }
                                    found[storage.name] = {
                                        storage,
                                        object,
                                        name: path.basename(mostRecentFile),
                                    };
                                    if (noRedact) {
                                        found[storage.name].data = data;
                                    }
                                    // clean up excess versions
                                    if (files.length > typeDef.maxVersions) {
                                        const removePromises = [];
                                        files.map((f) => {
                                            removePromises.push(storage.remove(f.name));
                                        });
                                        Promise.all(removePromises).then((result) => {
                                            if (result) {
                                                const removed = result.flat(1);
                                                if (logger.isInfoEnabled()) {
                                                    logger.info(`findById(${id}): removed ${removed.length} excess versions`);
                                                }
                                            }
                                        });
                                    }
                                    resolve();
                                })
                                    .catch((e) => {
                                    if (logger.isErrorEnabled()) {
                                        logger.error(`findById(${id}) error reading ${mostRecentFile}: ${e}`);
                                    }
                                    resolve();
                                });
                            }
                            else {
                                absent.push(storage);
                                resolve();
                            }
                        });
                    }));
                }
                yield Promise.all(listPromises);
                const checkExistsOnly = opts && typeof opts.exists === "boolean" && opts.exists === true;
                if (Object.keys(found).length === 0) {
                    if (checkExistsOnly) {
                        return false;
                    }
                    throw new MobilettoOrmNotFoundError(id);
                }
                else if (checkExistsOnly) {
                    return true;
                }
                const sortedFound = Object.values(found).sort((f1, f2) => f1.name && f2.name ? f1.name.localeCompare(f2.name) : 0);
                // sync: update older/missing versions to the newest version
                const newest = sortedFound[sortedFound.length - 1];
                const newestObj = newest.object;
                const newestJson = JSON.stringify(newestObj);
                const newestPath = typeDef.specificPath(newestObj);
                const syncPromises = [];
                for (let i = 0; i < sortedFound.length - 1; i++) {
                    const f = sortedFound[i];
                    if (newestJson !== JSON.stringify(f.object)) {
                        syncPromises.push(new Promise((resolve) => {
                            try {
                                resolve(f.storage.writeFile(newestPath, newestJson));
                            }
                            catch (e) {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(`findById: storage[${f.storage.name}].writeFile(${newestPath}) failed: ${e}`);
                                }
                                resolve(e);
                            }
                        }));
                    }
                }
                for (const missing of absent) {
                    syncPromises.push(new Promise((resolve) => {
                        try {
                            resolve(missing.writeFile(newestPath, newestJson));
                        }
                        catch (e) {
                            if (logger.isWarnEnabled()) {
                                logger.warn(`findById: storage[${missing.name}].writeFile(${newestPath}) failed: ${e}`);
                            }
                            resolve();
                        }
                    }));
                }
                try {
                    yield Promise.all(syncPromises);
                }
                catch (e) {
                    if (logger.isWarnEnabled()) {
                        logger.warn(`findById: error resolving syncPromises: ${e}`);
                    }
                }
                return noRedact ? newestObj : typeDef.redact(newestObj);
            });
        },
        find(predicate, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const typePath = typeDef.typePath();
                const removed = !!(opts && opts.removed && opts.removed === true);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
                const promises = [];
                const found = {};
                // read all things concurrently
                for (const storage of yield resolveStorages(storages)) {
                    promises.push(new Promise((resolve) => {
                        storage
                            .safeList(typePath)
                            .then((listing) => {
                            if (!listing || listing.length === 0) {
                                resolve();
                            }
                            const typeList = listing.filter((m) => m.type === M_DIR);
                            if (typeList.length === 0) {
                                resolve();
                            }
                            const findByIdPromises = [];
                            for (const dir of typeList) {
                                // find the latest version of each distinct thing
                                const id = path.basename(dir.name);
                                if (typeof found[id] === "undefined") {
                                    found[id] = null;
                                    findByIdPromises.push(new Promise((resolve2) => {
                                        repository
                                            .findById(id, { removed, noRedact })
                                            .then((thing) => {
                                            // does the thing match the predicate? if so, include in results
                                            // removed things are only included if opts.removed was set
                                            if (thing) {
                                                const obj = thing;
                                                if (predicate(obj) && includeRemovedThing(removed, obj)) {
                                                    found[id] = noRedact ? obj : typeDef.redact(obj);
                                                }
                                            }
                                            resolve2();
                                        })
                                            .catch((e3) => {
                                            if (logger.isWarnEnabled()) {
                                                logger.warn(`find: findById(${id}): ${e3}`);
                                            }
                                            resolve2();
                                        });
                                    }));
                                }
                            }
                            Promise.all(findByIdPromises)
                                .then(() => {
                                resolve();
                            })
                                .catch((e4) => {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(`find: ${e4}`);
                                }
                                resolve();
                            });
                        })
                            .catch((e2) => {
                            if (logger.isWarnEnabled()) {
                                logger.warn(`find: safeList(${typePath}): ${e2}`);
                            }
                            resolve();
                        });
                    }));
                }
                yield Promise.all(promises);
                const resolved = yield Promise.all(promises);
                if (resolved.length !== promises.length) {
                    if (logger.isWarnEnabled()) {
                        logger.warn(`find: ${resolved} of ${promises.length} promises resolved`);
                    }
                }
                return Object.values(found).filter((f) => f != null);
            });
        },
        safeFindBy(field, 
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value, 
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const first = (opts && typeof opts.first && opts.first === true) || false;
                try {
                    return yield this.findBy(field, value, opts);
                }
                catch (e) {
                    if (logger.isWarnEnabled()) {
                        logger.warn(`safeFindBy(${field}) threw ${e}`);
                    }
                    return first ? null : [];
                }
            });
        },
        findBy(field, 
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value, 
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const compValue = typeDef.fields &&
                    typeDef.fields[field] &&
                    value &&
                    typeof typeDef.fields[field].normalize === "function"
                    ? typeDef.fields[field].normalize(value)
                    : value;
                if (typeDef.primary && field === typeDef.primary) {
                    return [(yield this.findById(compValue, opts))];
                }
                const idxPath = typeDef.indexPath(field, compValue);
                const removed = !!(opts && opts.removed && opts.removed);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact) || !typeDef.hasRedactions();
                const exists = !!(opts && typeof opts.exists === "boolean" && opts.exists);
                const first = !!(opts && typeof opts.first === "boolean" && opts.first);
                const predicate = opts && typeof opts.predicate === "function" ? opts.predicate : null;
                // read all things concurrently
                const storagePromises = [];
                const found = {};
                const addedAnything = { found: false };
                for (const storage of yield resolveStorages(storages)) {
                    const logPrefix = `[1] storage(${storage.name}):`;
                    if ((exists || first) && addedAnything.found) {
                        break;
                    }
                    storagePromises.push(new Promise((resolve) => {
                        if ((exists || first) && addedAnything.found) {
                            resolve(`[1] storage(${storage.name}): already found, resolving`);
                        }
                        else {
                            storage
                                .safeList(idxPath)
                                .then((indexEntries) => {
                                const findByIdPromises = [];
                                for (const entry of indexEntries) {
                                    if ((exists || first) && addedAnything.found) {
                                        resolve(`${logPrefix} (after listing) already found, resolving`);
                                        return;
                                    }
                                    const id = typeDef.idFromPath(entry.name);
                                    if (typeof found[id] === "undefined") {
                                        found[id] = null;
                                        findByIdPromises.push(promiseFindById(repository, storage, field, value, id, exists, first, removed, noRedact, predicate, found, addedAnything));
                                    }
                                }
                                Promise.all(findByIdPromises)
                                    .then(() => {
                                    resolve(`${logPrefix} resolved ${findByIdPromises.length} findByIdPromises: ${JSON.stringify(findByIdPromises)}`);
                                })
                                    .catch((findErr) => {
                                    `${logPrefix} error resolving ${findByIdPromises.length} findByIdPromises: ${findErr}`;
                                });
                            })
                                .catch((e) => {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(`findBy(${field}, ${value}) error: ${e}`);
                                }
                                resolve(`${logPrefix} Resolving to error: ${e}`);
                            });
                        }
                    }));
                }
                const results = yield Promise.all(storagePromises);
                logger.info(`findBy promise results = ${JSON.stringify(results)}`);
                const foundValues = Object.values(found).filter((v) => v != null);
                if (exists) {
                    return foundValues.length > 0;
                }
                if (first) {
                    return foundValues.length > 0 ? foundValues[0] : null;
                }
                return foundValues;
            });
        },
        findVersionsById(id) {
            return __awaiter(this, void 0, void 0, function* () {
                const objPath = typeDef.generalPath(id);
                const storagePromises = [];
                const dataPromises = [];
                const found = {};
                // read current version from each storage
                for (const storage of yield resolveStorages(storages)) {
                    storagePromises.push(new Promise((resolve, reject) => {
                        storage
                            .safeList(objPath)
                            .then((files) => {
                            if (!files || files.length === 0) {
                                resolve();
                                return;
                            }
                            files
                                .filter((f) => f.name && typeDef.isSpecificPath(f.name))
                                .sort((f1, f2) => f1.name.localeCompare(f2.name))
                                .map((f) => {
                                dataPromises.push(new Promise((resolve2, reject2) => {
                                    storage
                                        .safeReadFile(f.name)
                                        .then((data) => {
                                        if (!data) {
                                            reject2(new MobilettoOrmError(`findVersionsById(${id}): safeReadFile error, no data`));
                                        }
                                        if (!typeDef.hasRedactions()) {
                                            f.data = data || undefined;
                                        }
                                        f.object = data
                                            ? typeDef.redact(JSON.parse(data.toString("utf8")))
                                            : undefined;
                                        resolve2(f);
                                    })
                                        .catch((e2) => {
                                        if (logger.isWarnEnabled()) {
                                            logger.warn(`findVersionsById(${id}): safeReadFile error ${e2}`);
                                        }
                                        reject2(e2);
                                    });
                                }));
                            });
                            Promise.all(dataPromises)
                                .then(() => {
                                found[storage.name] = files;
                                resolve();
                            })
                                .catch((e) => {
                                reject(e);
                            });
                        })
                            .catch((e) => {
                            if (logger.isErrorEnabled()) {
                                logger.error(`findVersionsById(${id}): ${e}`);
                            }
                            reject(e);
                        });
                    }));
                }
                yield Promise.all(storagePromises);
                return found;
            });
        },
        findAll(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                return repository.find(() => true, opts);
            });
        },
        findAllIncludingRemoved() {
            return __awaiter(this, void 0, void 0, function* () {
                return repository.find(() => true, { removed: true });
            });
        },
    };
    return repository;
};
export const repositoryFactory = (storages) => {
    return {
        storages,
        repository: (typeDef) => repo(storages, typeDef),
    };
};
