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
import { MobilettoOrmTypeDef, MobilettoOrmSyncError, MobilettoOrmNotFoundError, MobilettoOrmError, addError, } from "mobiletto-orm-typedef";
import { FIND_FIRST, } from "./types.js";
import { findVersion, includeRemovedThing, promiseFindById, resolveStorages, validateIndexes, verifyWrite, } from "./util.js";
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
                const obj = (yield typeDef.validate(thing));
                // does thing with PK exist? if so, error
                const id = typeDef.id(obj);
                if (!id) {
                    throw new MobilettoOrmNotFoundError(typeof obj !== "undefined" ? JSON.stringify(obj) : "undefined");
                }
                const errors = {};
                const found = yield repository.safeFindById(id);
                if (found != null) {
                    addError(errors, "id", "exists");
                }
                yield validateIndexes(this, obj, errors);
                obj._meta = typeDef.newMeta(id);
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, id, obj));
            });
        },
        update(editedThing) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function* () {
                const id = typeDef.id(editedThing);
                if (!id) {
                    throw new MobilettoOrmSyncError("undefined", "update: error determining id");
                }
                if (!((_a = editedThing === null || editedThing === void 0 ? void 0 : editedThing._meta) === null || _a === void 0 ? void 0 : _a.version)) {
                    throw new MobilettoOrmError("update: _meta.version is required");
                }
                // does thing with PK exist? if not, error
                const found = yield findVersion(repository, id, (_b = editedThing === null || editedThing === void 0 ? void 0 : editedThing._meta) === null || _b === void 0 ? void 0 : _b.version);
                if (!found._meta) {
                    throw new MobilettoOrmError("update: findVersion returned object without _meta");
                }
                // validate fields
                const obj = (yield typeDef.validate(editedThing, found));
                if (!obj._meta) {
                    throw new MobilettoOrmError("update: validate returned object without _meta");
                }
                yield validateIndexes(this, obj, {});
                obj._meta.version = typeDef.newVersion();
                const now = Date.now();
                if (typeof obj._meta.ctime !== "number" || obj._meta.ctime < 0) {
                    obj._meta.ctime = now;
                }
                if (typeof obj.mtime !== "number" || obj.mtime < obj.ctime) {
                    obj._meta.mtime = now;
                }
                const toWrite = Object.assign({}, found, obj);
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, id, toWrite, found));
            });
        },
        remove(thingToRemove) {
            var _a, _b;
            return __awaiter(this, void 0, void 0, function* () {
                if (typeof thingToRemove === "string" || !((_a = thingToRemove === null || thingToRemove === void 0 ? void 0 : thingToRemove._meta) === null || _a === void 0 ? void 0 : _a.version)) {
                    thingToRemove = yield this.findById(thingToRemove);
                }
                // is there a thing that matches current? if not, error
                const found = (yield findVersion(repository, typeDef.id(thingToRemove), (_b = thingToRemove._meta) === null || _b === void 0 ? void 0 : _b.version));
                const tombstone = typeDef.tombstone(found);
                return typeDef.redact(yield verifyWrite(repository, storages, typeDef, typeDef.id(found), tombstone, found));
            });
        },
        purge(idVal) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal, "purge");
                const found = yield this.findById(id, { removed: true });
                if (!typeDef.isTombstone(found)) {
                    throw new MobilettoOrmSyncError(id, `purge(${id}}: object must first be removed`);
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
        exists(id) {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield this.safeFindById(id)) != null;
            });
        },
        resolveId(id, ctx) {
            const resolved = typeof id === "object" ? this.id(id) : typeof id === "string" && id.length > 0 ? id : null;
            if (!resolved) {
                throw new MobilettoOrmError(`resolveId${ctx ? `[${ctx}]` : ""}: unresolvable id: ${id}`);
            }
            return resolved;
        },
        findById(idVal, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal, "findById");
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
                if (Object.values(found).length === 0) {
                    throw new MobilettoOrmNotFoundError(id);
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
                return (noRedact ? newestObj : typeDef.redact(newestObj));
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
                                                    found[id] = (noRedact ? obj : typeDef.redact(obj));
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
        count(predicate) {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield this.find(predicate)).length;
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
                const first = !!(opts && typeof opts.first === "boolean" && opts.first);
                const predicate = opts && typeof opts.predicate === "function" ? opts.predicate : null;
                // read all things concurrently
                const storagePromises = [];
                const found = {};
                const addedAnything = { found: false };
                for (const storage of yield resolveStorages(storages)) {
                    const logPrefix = `[1] storage(${storage.name}):`;
                    if (first && addedAnything.found) {
                        break;
                    }
                    storagePromises.push(new Promise((resolve) => {
                        if (first && addedAnything.found) {
                            resolve(`[1] storage(${storage.name}): already found, resolving`);
                        }
                        else {
                            storage
                                .safeList(idxPath)
                                .then((indexEntries) => {
                                const findByIdPromises = [];
                                for (const entry of indexEntries) {
                                    if (first && addedAnything.found) {
                                        resolve(`${logPrefix} (after listing) already found, resolving`);
                                        break;
                                    }
                                    const id = typeDef.idFromPath(entry.name);
                                    if (typeof found[id] === "undefined") {
                                        found[id] = null;
                                        findByIdPromises.push(promiseFindById(repository, storage, field, value, id, first, removed, noRedact, predicate, found, addedAnything));
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
                if (first) {
                    return foundValues.length > 0 ? foundValues[0] : null;
                }
                return foundValues;
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
        safeFindFirstBy(field, 
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value, 
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const found = yield this.safeFindBy(field, value, FIND_FIRST);
                    return found ? found : null;
                }
                catch (e) {
                    if (logger.isWarnEnabled()) {
                        logger.warn(`safeFindBy(${field}) threw ${e}`);
                    }
                    return null;
                }
            });
        },
        existsWith(field, value) {
            return __awaiter(this, void 0, void 0, function* () {
                const found = yield this.safeFindBy(field, value);
                return (found != null &&
                    ((Array.isArray(found) && found.length > 0) || (!Array.isArray(found) && typeof found === "object")));
            });
        },
        findVersionsById(id) {
            return __awaiter(this, void 0, void 0, function* () {
                const objPath = typeDef.generalPath(id);
                const storagePromises = [];
                const found = {};
                // read current version from each storage
                for (const storage of yield resolveStorages(storages)) {
                    storagePromises.push(new Promise((resolve, reject) => {
                        storage
                            .safeList(objPath)
                            .then((files) => {
                            const dataPromises = [];
                            if (!files || files.length === 0) {
                                resolve();
                            }
                            else {
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
                            }
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
        findSingleton() {
            return __awaiter(this, void 0, void 0, function* () {
                if (!typeDef.singleton) {
                    throw new MobilettoOrmError(`findSingleton: typeDef ${typeDef.typeName} is not a singleton type`);
                }
                return repository.findById(typeDef.singleton);
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
