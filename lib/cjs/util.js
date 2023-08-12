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
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactAndApply = exports.validateIndexes = exports.promiseFindById = exports.verifyWrite = exports.includeRemovedThing = exports.findVersion = exports.safeParseVersion = exports.parseVersion = exports.resolveStorages = void 0;
const mobiletto_base_1 = require("mobiletto-base");
const mobiletto_orm_typedef_1 = require("mobiletto-orm-typedef");
const resolveStorages = (stores, scope) => __awaiter(void 0, void 0, void 0, function* () {
    const resolved = Array.isArray(stores) ? stores : typeof stores === "function" ? yield stores() : null;
    if (resolved == null) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmError(`resolveStorages: stores was neither an array nor a function. stores=${stores}`);
    }
    const scoped = scope === "any" ? resolved : resolved.filter((s) => s.info().scope === scope);
    if (scoped.length === 0) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmError(`resolveStorages: none of the ${resolved.length} stores has scope=${scope}`);
    }
    return scoped;
});
exports.resolveStorages = resolveStorages;
const parseVersion = (repository, current) => {
    if (typeof current === "undefined" || current == null) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmError("no current version provided");
    }
    let version = current;
    if (typeof current === "object" && current._meta && typeof current._meta.version === "string") {
        version = current._meta.version;
    }
    if (typeof version !== "string" || !repository.typeDef.isVersion(version)) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmError(`parseVersion: expected current version as string (was ${typeof version}: ${version})`);
    }
    return version;
};
exports.parseVersion = parseVersion;
const safeParseVersion = (repository, current, defaultValue) => {
    try {
        return (0, exports.parseVersion)(repository, current);
    }
    catch (e) {
        return defaultValue;
    }
};
exports.safeParseVersion = safeParseVersion;
const findVersion = (repository, id, current, opts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const found = (yield repository.findById(id, opts));
    const foundVersion = (_a = found._meta) === null || _a === void 0 ? void 0 : _a.version;
    const expectedVersion = current
        ? (0, exports.safeParseVersion)(repository, current, `'error: no version detected in ${current}'`)
        : (0, exports.safeParseVersion)(repository, id, foundVersion || `'error: no version detected in ${id}'`);
    // is the current version what we expected? if not, error
    if (foundVersion !== expectedVersion) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, `expected version ${expectedVersion} but found ${foundVersion}`);
    }
    return found;
});
exports.findVersion = findVersion;
const includeRemovedThing = (includeRemoved, thing) => includeRemoved ||
    typeof thing._meta === "undefined" ||
    typeof thing._meta.removed === "undefined" ||
    (typeof thing._meta.removed === "boolean" && thing._meta.removed !== true);
exports.includeRemovedThing = includeRemovedThing;
const verifyWrite = (repository, storages, typeDef, id, obj, opts, previous) => __awaiter(void 0, void 0, void 0, function* () {
    const writePromises = [];
    const writeSuccesses = [];
    const actualStorages = yield (0, exports.resolveStorages)(storages, typeDef.scope);
    const expectedSuccessCount = typeDef.minWrites < 0 ? actualStorages.length : typeDef.minWrites;
    const objPath = typeDef.specificPath(obj);
    const prettyJson = opts && opts.prettyJson && opts.prettyJson === true;
    typeDef.transientFields.forEach((f) => {
        delete obj[f];
    });
    const objJson = prettyJson ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
    for (const storage of actualStorages) {
        // write object
        writePromises.push(new Promise((resolve) => {
            storage
                .writeFile(objPath, objJson)
                .then((bytesWritten) => {
                if (bytesWritten === objJson.length) {
                    writeSuccesses.push(true);
                    resolve(bytesWritten);
                }
                else {
                    const message = `verifyWrite(${id}): expected to write ${objJson.length} bytes but wrote ${bytesWritten}`;
                    const fail = new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, message);
                    if (mobiletto_base_1.logger.isWarnEnabled())
                        mobiletto_base_1.logger.warn(message);
                    resolve(fail);
                }
            })
                .catch((e) => {
                if (mobiletto_base_1.logger.isWarnEnabled())
                    mobiletto_base_1.logger.warn(`verifyWrite(${id}): error: ${JSON.stringify(e)}`);
                resolve(e);
            });
        }));
        for (const idx of typeDef.indexes) {
            const fieldName = idx.field;
            // Remove existing indexes when either is true:
            // 1. previous object exists and has a value for field:
            // 2. the new object is a tombstone (removed)
            if (previous &&
                (typeDef.isTombstone(obj) ||
                    (typeof previous[fieldName] !== "undefined" && previous[fieldName] != null))) {
                const idxPath = typeDef.indexSpecificPath(fieldName, previous);
                const indexPromise = new Promise((resolve) => {
                    storage
                        .remove(idxPath)
                        .then((result) => resolve(result))
                        .catch((e) => {
                        if (mobiletto_base_1.logger.isWarnEnabled()) {
                            mobiletto_base_1.logger.warn(`verifyWrite(${id}, index=${idxPath}, delete): error: ${JSON.stringify(e)}`);
                        }
                        resolve(e);
                    });
                });
                writePromises.push(indexPromise);
            }
            // Create new indexes if:
            // 1. not a removal AND
            // 2. obj has value for field
            if (!typeDef.isTombstone(obj) && typeof obj[fieldName] !== "undefined" && obj[fieldName] != null) {
                const idxPath = typeDef.indexSpecificPath(fieldName, obj);
                const indexPromise = new Promise((resolve) => {
                    storage.safeMetadata(idxPath).then(() => {
                        storage
                            .writeFile(idxPath, "")
                            .then(() => {
                            resolve(idxPath);
                        })
                            .catch((e) => {
                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                mobiletto_base_1.logger.warn(`verifyWrite(${id}, index=${idxPath}, create): error: ${JSON.stringify(e)}`);
                            }
                            resolve(e);
                        });
                    });
                });
                writePromises.push(indexPromise);
            }
        }
    }
    const writeResults = yield Promise.all(writePromises);
    if (mobiletto_base_1.logger.isDebugEnabled())
        mobiletto_base_1.logger.debug(`verifyWrite(${id}): writeResults = ${JSON.stringify(writeResults)}`);
    let failure = null;
    if (writeSuccesses.length < expectedSuccessCount) {
        failure = new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: writeSuccesses.length (${writeSuccesses.length}) < expectedSuccessCount (${expectedSuccessCount})`);
    }
    else {
        const failedWrites = [];
        const confirmedWrites = [];
        for (const storage of actualStorages) {
            failedWrites.push(storage.name);
        }
        try {
            const allVersions = yield repository.findVersionsById(id);
            for (const storageName of Object.keys(allVersions)) {
                if (storageName in allVersions) {
                    const versions = allVersions[storageName];
                    if (versions.length > 0 &&
                        versions[versions.length - 1].object &&
                        JSON.stringify(versions[versions.length - 1].object) === objJson) {
                        const idx = failedWrites.indexOf(storageName);
                        if (idx !== -1) {
                            failedWrites.splice(idx, 1);
                        }
                        confirmedWrites.push(storageName);
                    }
                    else {
                        if (mobiletto_base_1.logger.isWarnEnabled()) {
                            mobiletto_base_1.logger.warn(`verifyWrite(${id}): failedWrite to ${storageName}`);
                        }
                    }
                }
            }
            if (confirmedWrites.length < expectedSuccessCount) {
                failure = new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: confirmedWrites.length (${confirmedWrites.length}) < expectedSuccessCount (${expectedSuccessCount})`);
            }
        }
        catch (e) {
            if (mobiletto_base_1.logger.isWarnEnabled()) {
                mobiletto_base_1.logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(e)}`);
            }
            failure = new mobiletto_orm_typedef_1.MobilettoOrmSyncError(id, JSON.stringify(e));
        }
    }
    if (failure != null) {
        if (mobiletto_base_1.logger.isWarnEnabled()) {
            mobiletto_base_1.logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(failure)}`);
        }
        for (const storage of actualStorages) {
            yield storage.remove(objPath);
        }
        throw failure;
    }
    return obj;
});
exports.verifyWrite = verifyWrite;
const promiseFindById = (repository, storage, field, 
/* eslint-disable @typescript-eslint/no-explicit-any */
value, 
/* eslint-enable @typescript-eslint/no-explicit-any */
id, first, removed, noRedact, predicate, apply, applyResults, noCollect, found, addedAnything) => {
    const typeDef = repository.typeDef;
    const logPrefix = `promiseFindById(${storage.name}, ${field}, ${value})[${id}]:`;
    return new Promise((resolve) => {
        repository
            .findById(id, { removed, noRedact })
            .then((thing) => {
            const obj = thing;
            if ((0, exports.includeRemovedThing)(removed, obj) && (predicate == null || predicate(obj))) {
                const maybeRedacted = noRedact ? obj : typeDef.redact(obj);
                if (!noCollect) {
                    found[id] = maybeRedacted;
                }
                if (first) {
                    addedAnything.found = true;
                }
                if (apply) {
                    apply(maybeRedacted)
                        .then((result) => {
                        if (applyResults && result) {
                            applyResults[id] = result;
                        }
                        resolve(`${logPrefix} resolving FOUND (after apply): ${JSON.stringify(found[id])}`);
                    })
                        .catch((e) => {
                        resolve(`${logPrefix} resolving as error (after apply): ${e}`);
                    });
                }
                else {
                    resolve(`${logPrefix} resolving FOUND: ${JSON.stringify(found[id])}`);
                }
            }
            else {
                resolve(`${logPrefix} resolving (not including removed thing): ${JSON.stringify(obj)}`);
            }
        })
            .catch((e2) => {
            if (mobiletto_base_1.logger.isWarnEnabled()) {
                mobiletto_base_1.logger.warn(`${logPrefix} error: ${e2}`);
            }
            resolve(`${logPrefix} resolving as error: ${e2}`);
        });
    });
};
exports.promiseFindById = promiseFindById;
const validateIndexes = (repository, thing, errors) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d, _e;
    for (const idx of repository.typeDef.indexes.filter((i) => i.unique)) {
        if (typeof thing[idx.field] === "undefined" || thing[idx.field] == null) {
            (0, mobiletto_orm_typedef_1.addError)(errors, idx.field, "required");
        }
        else {
            const found = yield repository.safeFindFirstBy(idx.field, thing[idx.field]);
            if (found != null) {
                if (((_b = thing === null || thing === void 0 ? void 0 : thing._meta) === null || _b === void 0 ? void 0 : _b.id) && ((_c = found._meta) === null || _c === void 0 ? void 0 : _c.id) && ((_d = thing === null || thing === void 0 ? void 0 : thing._meta) === null || _d === void 0 ? void 0 : _d.id) === ((_e = found._meta) === null || _e === void 0 ? void 0 : _e.id)) {
                    // this is an update, we found ourselves: it's OK
                }
                else {
                    (0, mobiletto_orm_typedef_1.addError)(errors, idx.field, "exists");
                }
            }
        }
    }
    if ((0, mobiletto_orm_typedef_1.hasErrors)(errors)) {
        throw new mobiletto_orm_typedef_1.MobilettoOrmValidationError(errors);
    }
});
exports.validateIndexes = validateIndexes;
const redactAndApply = (typeDef, thing, opts) => __awaiter(void 0, void 0, void 0, function* () {
    if (!opts)
        return thing;
    const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
    const maybeRedacted = noRedact ? thing : typeDef.redact(thing);
    const apply = opts && opts.apply ? opts.apply : null;
    if (apply) {
        const result = yield apply(maybeRedacted);
        if (result && opts.applyResults) {
            opts.applyResults[typeDef.id(thing)] = result;
        }
    }
    return maybeRedacted;
});
exports.redactAndApply = redactAndApply;
