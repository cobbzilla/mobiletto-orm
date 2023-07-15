"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.repositoryFactory = void 0;
const path_1 = __importDefault(require("path"));
const mobiletto_base_1 = require("mobiletto-base");
const mobiletto_orm_typedef_1 = require("mobiletto-orm-typedef");
const util_js_1 = require("./util.js");
const repo = (storages, typeDefOrConfig) => {
    const typeDef = typeDefOrConfig instanceof mobiletto_orm_typedef_1.MobilettoOrmTypeDef ? typeDefOrConfig : new mobiletto_orm_typedef_1.MobilettoOrmTypeDef(typeDefOrConfig);
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
                    throw new mobiletto_orm_typedef_1.MobilettoOrmNotFoundError(typeof obj !== "undefined" ? JSON.stringify(obj) : "undefined");
                }
                let found = null;
                try {
                    found = yield repository.findById(id);
                }
                catch (e) {
                    if (e instanceof mobiletto_orm_typedef_1.MobilettoOrmNotFoundError) {
                        // expected
                    }
                    else {
                        throw e;
                    }
                }
                if (found != null) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmValidationError({ id: ["exists"] });
                }
                // save thing, then read current version: is it what we just wrote? if not then error
                obj._meta = typeDef.newMeta(id);
                return typeDef.redact(yield (0, util_js_1.verifyWrite)(repository, storages, typeDef, id, obj));
            });
        },
        update(editedThing, current) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = typeDef.id(editedThing);
                if (!id) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmSyncError("undefined", "update: error determining id");
                }
                if (typeof current === "undefined" || current == null) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, "update: current version is required");
                }
                // does thing with PK exist? if not, error
                const found = yield (0, util_js_1.findVersion)(repository, id, current);
                if (!found._meta) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmError("update: findVersion returned object without _meta");
                }
                // validate fields
                const obj = yield typeDef.validate(editedThing, found);
                if (!obj._meta) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmError("update: validate returned object without _meta");
                }
                if (typeof obj._meta.version === "undefined" ||
                    !obj._meta.version ||
                    found._meta.version === obj._meta.version) {
                    obj._meta.version = typeDef.newVersion();
                }
                // remove old indexes
                const indexCleanups = [];
                for (const fieldName of Object.keys(typeDef.fields)) {
                    const field = typeDef.fields[fieldName];
                    if (!!field.index && typeof found[fieldName] !== "undefined") {
                        const idxPath = typeDef.indexSpecificPath(fieldName, found);
                        for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
                            indexCleanups.push(storage.remove(idxPath));
                        }
                    }
                }
                yield Promise.all(indexCleanups);
                // update thing, then read current version: is it what we just wrote? if not, error
                const now = Date.now();
                if (typeof obj._meta.ctime !== "number" || obj._meta.ctime < 0) {
                    obj._meta.ctime = now;
                }
                if (typeof obj.mtime !== "number" || obj.mtime < obj.ctime) {
                    obj._meta.mtime = now;
                }
                const toWrite = Object.assign({}, found, obj);
                return typeDef.redact(yield (0, util_js_1.verifyWrite)(repository, storages, typeDef, id, toWrite));
            });
        },
        remove(id, current) {
            return __awaiter(this, void 0, void 0, function* () {
                // is there a thing that matches current? if not, error
                const found = (yield (0, util_js_1.findVersion)(repository, id, current));
                // write tombstone record, then read current version: is it what we just wrote? if not, error
                const tombstone = typeDef.tombstone(found);
                return typeDef.redact(yield (0, util_js_1.verifyWrite)(repository, storages, typeDef, typeDef.id(found), tombstone, found));
            });
        },
        purge(idVal) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = this.resolveId(idVal, "purge");
                const found = yield this.findById(id, { removed: true });
                if (!typeDef.isTombstone(found)) {
                    throw new mobiletto_orm_typedef_1.MobilettoOrmSyncError(idVal);
                }
                const objPath = typeDef.generalPath(id);
                const deletePromises = [];
                for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
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
        resolveId(id, ctx) {
            const resolved = typeof id === "object" ? this.id(id) : typeof id === "string" && id.length > 0 ? id : null;
            if (!resolved) {
                throw new mobiletto_orm_typedef_1.MobilettoOrmError(`resolveId${ctx ? `[${ctx}]` : ""}: unresolvable id: ${id}`);
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
                for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
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
                                    if (!(0, util_js_1.includeRemovedThing)(removed, object)) {
                                        resolve();
                                        return;
                                    }
                                    found[storage.name] = {
                                        storage,
                                        object,
                                        name: path_1.default.basename(mostRecentFile),
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
                                                if (mobiletto_base_1.logger.isInfoEnabled()) {
                                                    mobiletto_base_1.logger.info(`findById(${id}): removed ${removed.length} excess versions`);
                                                }
                                            }
                                        });
                                    }
                                    resolve();
                                })
                                    .catch((e) => {
                                    if (mobiletto_base_1.logger.isErrorEnabled()) {
                                        mobiletto_base_1.logger.error(`findById(${id}) error reading ${mostRecentFile}: ${e}`);
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
                    throw new mobiletto_orm_typedef_1.MobilettoOrmNotFoundError(id);
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
                                if (mobiletto_base_1.logger.isWarnEnabled()) {
                                    mobiletto_base_1.logger.warn(`findById: storage[${f.storage.name}].writeFile(${newestPath}) failed: ${e}`);
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
                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                mobiletto_base_1.logger.warn(`findById: storage[${missing.name}].writeFile(${newestPath}) failed: ${e}`);
                            }
                            resolve();
                        }
                    }));
                }
                try {
                    yield Promise.all(syncPromises);
                }
                catch (e) {
                    if (mobiletto_base_1.logger.isWarnEnabled()) {
                        mobiletto_base_1.logger.warn(`findById: error resolving syncPromises: ${e}`);
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
                for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
                    promises.push(new Promise((resolve) => {
                        storage
                            .safeList(typePath)
                            .then((listing) => {
                            if (!listing || listing.length === 0) {
                                resolve();
                            }
                            const typeList = listing.filter((m) => m.type === mobiletto_base_1.M_DIR);
                            if (typeList.length === 0) {
                                resolve();
                            }
                            const findByIdPromises = [];
                            for (const dir of typeList) {
                                // find the latest version of each distinct thing
                                const id = path_1.default.basename(dir.name);
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
                                                if (predicate(obj) && (0, util_js_1.includeRemovedThing)(removed, obj)) {
                                                    found[id] = (noRedact ? obj : typeDef.redact(obj));
                                                }
                                            }
                                            resolve2();
                                        })
                                            .catch((e3) => {
                                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                                mobiletto_base_1.logger.warn(`find: findById(${id}): ${e3}`);
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
                                if (mobiletto_base_1.logger.isWarnEnabled()) {
                                    mobiletto_base_1.logger.warn(`find: ${e4}`);
                                }
                                resolve();
                            });
                        })
                            .catch((e2) => {
                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                mobiletto_base_1.logger.warn(`find: safeList(${typePath}): ${e2}`);
                            }
                            resolve();
                        });
                    }));
                }
                yield Promise.all(promises);
                const resolved = yield Promise.all(promises);
                if (resolved.length !== promises.length) {
                    if (mobiletto_base_1.logger.isWarnEnabled()) {
                        mobiletto_base_1.logger.warn(`find: ${resolved} of ${promises.length} promises resolved`);
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
                    if (mobiletto_base_1.logger.isWarnEnabled()) {
                        mobiletto_base_1.logger.warn(`safeFindBy(${field}) threw ${e}`);
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
                for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
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
                                        break;
                                    }
                                    const id = typeDef.idFromPath(entry.name);
                                    if (typeof found[id] === "undefined") {
                                        found[id] = null;
                                        findByIdPromises.push((0, util_js_1.promiseFindById)(repository, storage, field, value, id, exists, first, removed, noRedact, predicate, found, addedAnything));
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
                                if (mobiletto_base_1.logger.isWarnEnabled()) {
                                    mobiletto_base_1.logger.warn(`findBy(${field}, ${value}) error: ${e}`);
                                }
                                resolve(`${logPrefix} Resolving to error: ${e}`);
                            });
                        }
                    }));
                }
                const results = yield Promise.all(storagePromises);
                mobiletto_base_1.logger.info(`findBy promise results = ${JSON.stringify(results)}`);
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
                const found = {};
                // read current version from each storage
                for (const storage of yield (0, util_js_1.resolveStorages)(storages)) {
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
                                                reject2(new mobiletto_orm_typedef_1.MobilettoOrmError(`findVersionsById(${id}): safeReadFile error, no data`));
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
                                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                                mobiletto_base_1.logger.warn(`findVersionsById(${id}): safeReadFile error ${e2}`);
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
                            if (mobiletto_base_1.logger.isErrorEnabled()) {
                                mobiletto_base_1.logger.error(`findVersionsById(${id}): ${e}`);
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
const repositoryFactory = (storages) => {
    return {
        storages,
        repository: (typeDef) => repo(storages, typeDef),
    };
};
exports.repositoryFactory = repositoryFactory;
