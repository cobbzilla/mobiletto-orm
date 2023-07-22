var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { logger } from "mobiletto-base";
import { addError, hasErrors, MobilettoOrmError, MobilettoOrmSyncError, MobilettoOrmValidationError, } from "mobiletto-orm-typedef";
export const resolveStorages = (stores) => __awaiter(void 0, void 0, void 0, function* () {
    if (Array.isArray(stores))
        return stores;
    if (typeof stores === "function")
        return yield stores();
    throw new MobilettoOrmError(`resolveStorages: stores was neither an array nor a function. stores=${stores}`);
});
export const parseVersion = (repository, current) => {
    if (typeof current === "undefined" || current == null) {
        throw new MobilettoOrmError("no current version provided");
    }
    let version = current;
    if (typeof current === "object" && current._meta && typeof current._meta.version === "string") {
        version = current._meta.version;
    }
    if (typeof version !== "string" || !repository.typeDef.isVersion(version)) {
        throw new MobilettoOrmError(`parseVersion: expected current version as string (was ${typeof version}: ${version})`);
    }
    return version;
};
export const safeParseVersion = (repository, current, defaultValue) => {
    try {
        return parseVersion(repository, current);
    }
    catch (e) {
        return defaultValue;
    }
};
export const findVersion = (repository, id, current) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const found = (yield repository.findById(id));
    const foundVersion = (_a = found._meta) === null || _a === void 0 ? void 0 : _a.version;
    const expectedVersion = current
        ? safeParseVersion(repository, current, `'error: no version detected in ${current}'`)
        : safeParseVersion(repository, id, foundVersion || `'error: no version detected in ${id}'`);
    // is the current version what we expected? if not, error
    if (foundVersion !== expectedVersion) {
        throw new MobilettoOrmSyncError(id, `expected version ${expectedVersion} but found ${foundVersion}`);
    }
    return found;
});
export const includeRemovedThing = (includeRemoved, thing) => includeRemoved ||
    typeof thing._meta === "undefined" ||
    typeof thing._meta.removed === "undefined" ||
    (typeof thing._meta.removed === "boolean" && thing._meta.removed !== true);
export const verifyWrite = (repository, storages, typeDef, id, obj, previous) => __awaiter(void 0, void 0, void 0, function* () {
    const writePromises = [];
    const writeSuccesses = [];
    const actualStorages = yield resolveStorages(storages);
    const expectedSuccessCount = typeDef.minWrites < 0 ? actualStorages.length : typeDef.minWrites;
    const objPath = typeDef.specificPath(obj);
    const objJson = JSON.stringify(obj);
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
                    const fail = new MobilettoOrmSyncError(id, message);
                    if (logger.isWarnEnabled())
                        logger.warn(message);
                    resolve(fail);
                }
            })
                .catch((e) => {
                if (logger.isWarnEnabled())
                    logger.warn(`verifyWrite(${id}): error: ${JSON.stringify(e)}`);
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
                        if (logger.isWarnEnabled()) {
                            logger.warn(`verifyWrite(${id}, index=${idxPath}, delete): error: ${JSON.stringify(e)}`);
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
                            if (logger.isWarnEnabled()) {
                                logger.warn(`verifyWrite(${id}, index=${idxPath}, create): error: ${JSON.stringify(e)}`);
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
    if (logger.isDebugEnabled())
        logger.debug(`verifyWrite(${id}): writeResults = ${JSON.stringify(writeResults)}`);
    let failure = null;
    if (writeSuccesses.length < expectedSuccessCount) {
        failure = new MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: writeSuccesses.length (${writeSuccesses.length}) < expectedSuccessCount (${expectedSuccessCount})`);
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
                        if (logger.isWarnEnabled()) {
                            logger.warn(`verifyWrite(${id}): failedWrite to ${storageName}`);
                        }
                    }
                }
            }
            if (confirmedWrites.length < expectedSuccessCount) {
                failure = new MobilettoOrmSyncError(id, `verifyWrite(${id}): insufficient writes: confirmedWrites.length (${confirmedWrites.length}) < expectedSuccessCount (${expectedSuccessCount})`);
            }
        }
        catch (e) {
            if (logger.isWarnEnabled()) {
                logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(e)}`);
            }
            failure = new MobilettoOrmSyncError(id, JSON.stringify(e));
        }
    }
    if (failure != null) {
        if (logger.isWarnEnabled()) {
            logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(failure)}`);
        }
        for (const storage of actualStorages) {
            yield storage.remove(objPath);
        }
        throw failure;
    }
    return obj;
});
export const promiseFindById = (repository, storage, field, 
/* eslint-disable @typescript-eslint/no-explicit-any */
value, 
/* eslint-enable @typescript-eslint/no-explicit-any */
id, first, removed, noRedact, predicate, found, addedAnything) => {
    const typeDef = repository.typeDef;
    const logPrefix = `promiseFindById(${storage.name}, ${field}, ${value})[${id}]:`;
    return new Promise((resolve) => {
        repository
            .findById(id, { removed, noRedact })
            .then((thing) => {
            const obj = thing;
            if (includeRemovedThing(removed, obj) && (predicate == null || predicate(obj))) {
                found[id] = noRedact ? obj : typeDef.redact(obj);
                if (first) {
                    addedAnything.found = true;
                }
                resolve(`${logPrefix} resolving FOUND: ${JSON.stringify(obj)}`);
            }
            else {
                resolve(`${logPrefix} resolving (not including removed thing): ${JSON.stringify(obj)}`);
            }
        })
            .catch((e2) => {
            if (logger.isWarnEnabled()) {
                logger.warn(`${logPrefix} error: ${e2}`);
            }
            resolve(`${logPrefix} resolving as error: ${e2}`);
        });
    });
};
export const validateIndexes = (repository, thing, errors) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d, _e;
    for (const idx of repository.typeDef.indexes.filter((i) => i.unique)) {
        if (typeof thing[idx.field] === "undefined" || thing[idx.field] == null) {
            addError(errors, idx.field, "required");
        }
        else {
            const found = yield repository.safeFindFirstBy(idx.field, thing[idx.field]);
            if (found != null) {
                if (((_b = thing === null || thing === void 0 ? void 0 : thing._meta) === null || _b === void 0 ? void 0 : _b.id) && ((_c = found._meta) === null || _c === void 0 ? void 0 : _c.id) && ((_d = thing === null || thing === void 0 ? void 0 : thing._meta) === null || _d === void 0 ? void 0 : _d.id) === ((_e = found._meta) === null || _e === void 0 ? void 0 : _e.id)) {
                    // this is an update, we found ourselves: it's OK
                }
                else {
                    addError(errors, idx.field, "exists");
                }
            }
        }
    }
    if (hasErrors(errors)) {
        throw new MobilettoOrmValidationError(errors);
    }
});
