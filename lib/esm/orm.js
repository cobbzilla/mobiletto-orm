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
import { logger, rand } from "mobiletto-base";
import { FIND_FIRST, FIND_ALL, MobilettoOrmTypeDef, MobilettoOrmTypeDefRegistry, MobilettoOrmSyncError, MobilettoOrmNotFoundError, MobilettoOrmError, addError, DEFAULT_FIELD_INDEX_LEVELS, FIND_NOREDACT, mergeDeep, } from "mobiletto-orm-typedef";
import { findVersion, includeRemovedThing, promiseFindById, redactAndApply, resolveStorages, validateIndexes, verifyWrite, } from "./util.js";
import { search } from "./search.js";
const repo = (factory, storages, typeDefOrConfig, opts) => {
    const typeDef = typeDefOrConfig instanceof MobilettoOrmTypeDef ? typeDefOrConfig : new MobilettoOrmTypeDef(typeDefOrConfig);
    const repository = {
        typeDef,
        factory,
        validate(thing, current) {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield typeDef.validate(thing, current));
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
                    addError(errors, typeDef.idFieldName(), "exists");
                }
                yield validateIndexes(this, obj, errors);
                obj._meta = typeDef.newMeta(id);
                const created = (yield verifyWrite(repository, storages, typeDef, id, obj, opts));
                if (typeof this.afterCreate === "function") {
                    this.afterCreate(created);
                }
                return created;
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
                const found = yield findVersion(repository, id, (_b = editedThing === null || editedThing === void 0 ? void 0 : editedThing._meta) === null || _b === void 0 ? void 0 : _b.version, FIND_NOREDACT);
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
                obj._meta.ctime = found._meta.ctime;
                obj._meta.mtime = now;
                const toWrite = mergeDeep({}, found, obj);
                const updated = (yield verifyWrite(repository, storages, typeDef, id, toWrite, opts, found));
                if (typeof this.afterUpdate === "function") {
                    this.afterUpdate(updated);
                }
                return typeDef.redact(updated);
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
                const removed = (yield verifyWrite(repository, storages, typeDef, typeDef.id(found), tombstone, opts, found));
                if (typeof this.afterRemove === "function") {
                    this.afterRemove(removed);
                }
                return typeDef.redact(removed);
            });
        },
        purge(idVal, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal, "purge");
                const found = yield this.findById(id, { removed: true });
                const force = (opts && opts.force === true) || false;
                if (!typeDef.isTombstone(found)) {
                    if (!force) {
                        throw new MobilettoOrmSyncError(id, `purge(${id}}: object must first be removed`);
                    }
                    else {
                        yield this.remove(found);
                    }
                }
                const objPath = typeDef.generalPath(id);
                const deletePromises = [];
                for (const storage of yield resolveStorages(storages, typeDef.scope)) {
                    deletePromises.push(new Promise((resolve, reject) => {
                        storage
                            .remove(objPath, { recursive: true })
                            .then((result) => resolve(result))
                            .catch((e) => {
                            reject(e);
                        });
                    }));
                }
                if (typeof this.afterPurge === "function") {
                    this.afterPurge(found);
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
                const idPath = !!(opts && opts.idPath && opts.idPath === true);
                const id = this.resolveId(idVal, "findById");
                const objPath = idPath ? id : typeDef.generalPath(id);
                const listPromises = [];
                const found = {};
                const absent = [];
                const removed = !!(opts && opts.removed && opts.removed === true);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
                // read current version from each storage
                for (const storage of yield resolveStorages(storages, typeDef.scope)) {
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
                                if (logger.isWarningEnabled()) {
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
                            if (logger.isWarningEnabled()) {
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
                    if (logger.isWarningEnabled()) {
                        logger.warn(`findById: error resolving syncPromises: ${e}`);
                    }
                }
                return (noRedact ? newestObj : typeDef.redact(newestObj));
            });
        },
        find(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let predicate = opts && opts.predicate ? opts.predicate : FIND_ALL;
                if (typeof predicate !== "function") {
                    logger.warn(`find: opts.predicate was not a function, using FIND_ALL instead of: ${predicate}`);
                    predicate = FIND_ALL;
                }
                const searchPath = typeDef.typePath() + (opts && opts.idPath ? opts.idPath : "");
                const removed = !!(opts && opts.removed && opts.removed === true);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
                const noCollect = !!(opts && opts.noCollect && opts.noCollect === true) || false;
                const promises = [];
                const foundByHash = {};
                const foundById = {};
                // read all things concurrently
                for (const storage of yield resolveStorages(storages, typeDef.scope)) {
                    promises.push(search(repository, storage, searchPath, removed, noRedact, noCollect, predicate, opts, promises, foundByHash, foundById));
                }
                yield Promise.all(promises);
                const resolved = yield Promise.all(promises);
                if (resolved.length !== promises.length) {
                    if (logger.isWarningEnabled()) {
                        logger.warn(`find: ${resolved} of ${promises.length} promises resolved`);
                    }
                }
                return Object.values(foundById).filter((f) => f != null);
            });
        },
        count(predicate) {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield this.find({ predicate })).length;
            });
        },
        findBy(field, value, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const removed = !!(opts && opts.removed && opts.removed);
                const first = !!(opts && typeof opts.first === "boolean" && opts.first);
                const predicate = opts && typeof opts.predicate === "function" ? opts.predicate : null;
                if (typeDef.primary && field === typeDef.primary) {
                    const foundById = (yield this.findById(value, opts));
                    if (!removed && typeDef.isTombstone(foundById)) {
                        return first ? null : [];
                    }
                    if (predicate && !predicate(foundById)) {
                        return first ? null : [];
                    }
                    const maybeRedacted = yield redactAndApply(typeDef, foundById, opts);
                    return first ? maybeRedacted : [maybeRedacted];
                }
                const compValue = typeDef.fields &&
                    typeDef.fields[field] &&
                    value &&
                    typeof typeDef.fields[field].normalize === "function"
                    ? yield typeDef.fields[field].normalize(value)
                    : value;
                const idxPaths = typeDef.indexPaths(field, compValue);
                const noRedact = !!(opts && opts.noRedact && opts.noRedact) || !typeDef.hasRedactions();
                const noCollect = !!(opts && opts.noCollect && opts.noCollect) || false;
                const apply = opts && typeof opts.apply === "function" ? opts.apply : null;
                const applyResults = opts && typeof opts.applyResults === "object" ? opts.applyResults : null;
                // read all things concurrently
                const storagePromises = [];
                const found = {};
                const addedAnything = { found: false };
                for (const storage of yield resolveStorages(storages, typeDef.scope)) {
                    const logPrefix = `[1] storage(${storage.name}):`;
                    if (first && addedAnything.found) {
                        break;
                    }
                    for (const idxPath of idxPaths) {
                        storagePromises.push(new Promise((resolve) => {
                            if (first && addedAnything.found) {
                                resolve(`[1] storage(${storage.name}): already found, resolving`);
                            }
                            else {
                                const indexLevels = typeDef.fields[field].indexLevels || DEFAULT_FIELD_INDEX_LEVELS;
                                storage
                                    .safeList(idxPath, { recursive: indexLevels > 0 })
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
                                            findByIdPromises.push(promiseFindById(repository, storage, id, first, removed, noRedact, predicate, apply, applyResults, noCollect, found, addedAnything));
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
                                    if (logger.isWarningEnabled()) {
                                        logger.warn(`findBy(${field}, ${value}) error: ${e}`);
                                    }
                                    resolve(`${logPrefix} Resolving to error: ${e}`);
                                });
                            }
                        }));
                    }
                }
                const results = yield Promise.all(storagePromises);
                if (logger.isDebugEnabled())
                    logger.debug(`findBy promise results = ${JSON.stringify(results)}`);
                const foundValues = Object.values(found).filter((v) => v != null);
                if (first) {
                    return foundValues.length > 0 ? foundValues[0] : null;
                }
                return foundValues;
            });
        },
        safeFindBy(field, value, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                const first = (opts && typeof opts.first && opts.first === true) || false;
                try {
                    return yield this.findBy(field, value, opts);
                }
                catch (e) {
                    if (logger.isWarningEnabled()) {
                        logger.warn(`safeFindBy(${field}) threw ${e}`);
                    }
                    return first ? null : [];
                }
            });
        },
        safeFindFirstBy(field, value, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const found = yield this.safeFindBy(field, value, Object.assign({}, FIND_FIRST, opts || {}));
                    return found ? found : null;
                }
                catch (e) {
                    if (logger.isWarningEnabled()) {
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
        findVersionsById(id, redact) {
            return __awaiter(this, void 0, void 0, function* () {
                const objPath = typeDef.generalPath(id);
                const storagePromises = [];
                const found = {};
                redact = typeof redact === "undefined" || redact;
                // read current version from each storage
                for (const storage of yield resolveStorages(storages, typeDef.scope)) {
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
                                            if (!typeDef.hasRedactions() || !redact) {
                                                f.data = data || undefined;
                                            }
                                            f.object = data
                                                ? redact
                                                    ? typeDef.redact(JSON.parse(data.toString("utf8")))
                                                    : JSON.parse(data.toString("utf8"))
                                                : undefined;
                                            resolve2(f);
                                        })
                                            .catch((e2) => {
                                            if (logger.isWarningEnabled()) {
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
                return repository.find(Object.assign({ predicate: FIND_ALL }, opts || {}));
            });
        },
        findAllIncludingRemoved() {
            return __awaiter(this, void 0, void 0, function* () {
                return repository.find({ predicate: FIND_ALL, removed: true });
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
const ormResolver = (repo) => (id) => __awaiter(void 0, void 0, void 0, function* () { return repo.findById(id); });
export const repositoryFactory = (storages, opts) => {
    const registry = new MobilettoOrmTypeDefRegistry({
        name: (opts === null || opts === void 0 ? void 0 : opts.registryName) ? opts.registryName : `MobilettoOrmTypeDefRegistry@${rand(8)}`,
    });
    const factory = { storages };
    factory.repository = (typeDef) => {
        if (!typeDef.typeName) {
            throw new MobilettoOrmError("typeDef.name is required");
        }
        typeDef.registry = registry;
        const rp = repo(factory, storages, typeDef, opts);
        registry.register(typeDef.typeName, ormResolver(rp));
        return rp;
    };
    return factory;
};
//# sourceMappingURL=orm.js.map