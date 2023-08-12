import { logger, MobilettoConnection } from "mobiletto-base";
import {
    addError,
    hasErrors,
    MobilettoOrmError,
    MobilettoOrmIdArg,
    MobilettoOrmObject,
    MobilettoOrmSyncError,
    MobilettoOrmTypeDef,
    MobilettoOrmApplyFunc,
    MobilettoOrmFindOpts,
    MobilettoOrmPredicate,
    MobilettoOrmValidationError,
    MobilettoOrmValidationErrors,
    MobilettoOrmTypeDefScope,
} from "mobiletto-orm-typedef";
import { MobilettoOrmRepository, MobilettoOrmStorageResolver } from "./types.js";
import { MobilettoOrmRepositoryOptions } from "./orm.js";

export const resolveStorages = async (
    stores: MobilettoConnection[] | MobilettoOrmStorageResolver,
    scope: MobilettoOrmTypeDefScope
): Promise<MobilettoConnection[]> => {
    const resolved = Array.isArray(stores) ? stores : typeof stores === "function" ? await stores() : null;
    if (resolved == null) {
        throw new MobilettoOrmError(`resolveStorages: stores was neither an array nor a function. stores=${stores}`);
    }
    const scoped = scope === "any" ? resolved : resolved.filter((s) => s.info().scope === scope);
    if (scoped.length === 0) {
        throw new MobilettoOrmError(`resolveStorages: none of the ${resolved.length} stores has scope=${scope}`);
    }
    return scoped;
};

export const parseVersion = <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    current: MobilettoOrmIdArg
) => {
    if (typeof current === "undefined" || current == null) {
        throw new MobilettoOrmError("no current version provided");
    }
    let version = current;
    if (typeof current === "object" && current._meta && typeof current._meta.version === "string") {
        version = current._meta.version;
    }
    if (typeof version !== "string" || !repository.typeDef.isVersion(version)) {
        throw new MobilettoOrmError(
            `parseVersion: expected current version as string (was ${typeof version}: ${version})`
        );
    }
    return version;
};

export const safeParseVersion = <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    current: MobilettoOrmIdArg,
    defaultValue: string
): string => {
    try {
        return parseVersion(repository, current);
    } catch (e) {
        return defaultValue;
    }
};

export const findVersion = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    id: MobilettoOrmIdArg,
    current?: MobilettoOrmIdArg,
    opts?: MobilettoOrmFindOpts
): Promise<T> => {
    const found = (await repository.findById(id, opts)) as T;
    const foundVersion = found._meta?.version;
    const expectedVersion = current
        ? safeParseVersion(repository, current, `'error: no version detected in ${current}'`)
        : safeParseVersion(repository, id, foundVersion || `'error: no version detected in ${id}'`);

    // is the current version what we expected? if not, error
    if (foundVersion !== expectedVersion) {
        throw new MobilettoOrmSyncError(id, `expected version ${expectedVersion} but found ${foundVersion}`);
    }
    return found;
};

export const includeRemovedThing = (includeRemoved: boolean, thing: MobilettoOrmObject): boolean =>
    includeRemoved ||
    typeof thing._meta === "undefined" ||
    typeof thing._meta.removed === "undefined" ||
    (typeof thing._meta.removed === "boolean" && thing._meta.removed !== true);

export const verifyWrite = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver,
    typeDef: MobilettoOrmTypeDef,
    id: string,
    obj: MobilettoOrmObject,
    opts?: MobilettoOrmRepositoryOptions,
    previous?: MobilettoOrmObject
) => {
    const writePromises: Promise<number | string | string[] | Error>[] = [];
    const writeSuccesses: boolean[] = [];
    const actualStorages = await resolveStorages(storages, typeDef.scope);
    const expectedSuccessCount = typeDef.minWrites < 0 ? actualStorages.length : typeDef.minWrites;
    const objPath = typeDef.specificPath(obj);
    const prettyJson = opts && opts.prettyJson && opts.prettyJson === true;
    typeDef.transientFields.forEach((f) => {
        delete obj[f];
    });
    const objJson = prettyJson ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
    for (const storage of actualStorages) {
        // write object
        writePromises.push(
            new Promise<number | Error>((resolve) => {
                storage
                    .writeFile(objPath, objJson)
                    .then((bytesWritten: number) => {
                        if (bytesWritten === objJson.length) {
                            writeSuccesses.push(true);
                            resolve(bytesWritten);
                        } else {
                            const message = `verifyWrite(${id}): expected to write ${objJson.length} bytes but wrote ${bytesWritten}`;
                            const fail = new MobilettoOrmSyncError(id, message);
                            if (logger.isWarningEnabled()) logger.warn(message);
                            resolve(fail);
                        }
                    })
                    .catch((e: Error) => {
                        if (logger.isWarningEnabled()) logger.warn(`verifyWrite(${id}): error: ${JSON.stringify(e)}`);
                        resolve(e);
                    });
            })
        );
        for (const idx of typeDef.indexes) {
            const fieldName = idx.field;
            // Remove existing indexes when either is true:
            // 1. previous object exists and has a value for field:
            // 2. the new object is a tombstone (removed)
            if (
                previous &&
                (typeDef.isTombstone(obj) ||
                    (typeof previous[fieldName] !== "undefined" && previous[fieldName] != null))
            ) {
                const idxPath = typeDef.indexSpecificPath(fieldName, previous);
                const indexPromise = new Promise<string | string[] | Error>((resolve) => {
                    storage
                        .remove(idxPath)
                        .then((result: string | string[]) => resolve(result))
                        .catch((e: Error) => {
                            if (logger.isWarningEnabled()) {
                                logger.warn(
                                    `verifyWrite(${id}, index=${idxPath}, delete): error: ${JSON.stringify(e)}`
                                );
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
                const indexPromise = new Promise<string | Error>((resolve) => {
                    storage.safeMetadata(idxPath).then(() => {
                        storage
                            .writeFile(idxPath, "")
                            .then(() => {
                                resolve(idxPath);
                            })
                            .catch((e: Error) => {
                                if (logger.isWarningEnabled()) {
                                    logger.warn(
                                        `verifyWrite(${id}, index=${idxPath}, create): error: ${JSON.stringify(e)}`
                                    );
                                }
                                resolve(e);
                            });
                    });
                });
                writePromises.push(indexPromise);
            }
        }
    }
    const writeResults = await Promise.all(writePromises);
    if (logger.isDebugEnabled()) logger.debug(`verifyWrite(${id}): writeResults = ${JSON.stringify(writeResults)}`);

    let failure = null;
    if (writeSuccesses.length < expectedSuccessCount) {
        failure = new MobilettoOrmSyncError(
            id,
            `verifyWrite(${id}): insufficient writes: writeSuccesses.length (${writeSuccesses.length}) < expectedSuccessCount (${expectedSuccessCount})`
        );
    } else {
        const failedWrites = [];
        const confirmedWrites = [];
        for (const storage of actualStorages) {
            failedWrites.push(storage.name);
        }
        try {
            const allVersions = await repository.findVersionsById(id);
            for (const storageName of Object.keys(allVersions)) {
                if (storageName in allVersions) {
                    const versions = allVersions[storageName];
                    if (
                        versions.length > 0 &&
                        versions[versions.length - 1].object &&
                        JSON.stringify(versions[versions.length - 1].object) === objJson
                    ) {
                        const idx = failedWrites.indexOf(storageName);
                        if (idx !== -1) {
                            failedWrites.splice(idx, 1);
                        }
                        confirmedWrites.push(storageName);
                    } else {
                        if (logger.isWarningEnabled()) {
                            logger.warn(`verifyWrite(${id}): failedWrite to ${storageName}`);
                        }
                    }
                }
            }
            if (confirmedWrites.length < expectedSuccessCount) {
                failure = new MobilettoOrmSyncError(
                    id,
                    `verifyWrite(${id}): insufficient writes: confirmedWrites.length (${confirmedWrites.length}) < expectedSuccessCount (${expectedSuccessCount})`
                );
            }
        } catch (e) {
            if (logger.isWarningEnabled()) {
                logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(e)}`);
            }
            failure = new MobilettoOrmSyncError(id, JSON.stringify(e));
        }
    }
    if (failure != null) {
        if (logger.isWarningEnabled()) {
            logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(failure)}`);
        }
        for (const storage of actualStorages) {
            await storage.remove(objPath);
        }
        throw failure;
    }
    return obj;
};

export type MobilettoFoundMarker = { found: boolean };

export const promiseFindById = <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    storage: MobilettoConnection,
    field: string,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    value: any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
    id: string,
    first: boolean,
    removed: boolean,
    noRedact: boolean,
    predicate: MobilettoOrmPredicate | null,
    apply: MobilettoOrmApplyFunc | null,
    applyResults: Record<string, unknown> | null,
    noCollect: boolean,
    found: Record<string, MobilettoOrmObject | null>,
    addedAnything: MobilettoFoundMarker
): Promise<string> => {
    const typeDef = repository.typeDef;
    const logPrefix = `promiseFindById(${storage.name}, ${field}, ${value})[${id}]:`;
    return new Promise<string>((resolve) => {
        repository
            .findById(id, { removed, noRedact })
            .then((thing) => {
                const obj = thing as MobilettoOrmObject;
                if (includeRemovedThing(removed, obj) && (predicate == null || predicate(obj))) {
                    const maybeRedacted = noRedact ? obj : typeDef.redact(obj);
                    if (!noCollect) {
                        found[id] = maybeRedacted;
                    }
                    if (first) {
                        addedAnything.found = true;
                    }
                    if (apply) {
                        apply(maybeRedacted)
                            .then((result: unknown) => {
                                if (applyResults && result) {
                                    applyResults[id] = result;
                                }
                                resolve(`${logPrefix} resolving FOUND (after apply): ${JSON.stringify(found[id])}`);
                            })
                            .catch((e) => {
                                resolve(`${logPrefix} resolving as error (after apply): ${e}`);
                            });
                    } else {
                        resolve(`${logPrefix} resolving FOUND: ${JSON.stringify(found[id])}`);
                    }
                } else {
                    resolve(`${logPrefix} resolving (not including removed thing): ${JSON.stringify(obj)}`);
                }
            })
            .catch((e2) => {
                if (logger.isWarningEnabled()) {
                    logger.warn(`${logPrefix} error: ${e2}`);
                }
                resolve(`${logPrefix} resolving as error: ${e2}`);
            });
    });
};

export const validateIndexes = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    thing: T,
    errors: MobilettoOrmValidationErrors
): Promise<void> => {
    for (const idx of repository.typeDef.indexes.filter((i) => i.unique)) {
        if (typeof thing[idx.field] === "undefined" || thing[idx.field] == null) {
            addError(errors, idx.field, "required");
        } else {
            const found = await repository.safeFindFirstBy(idx.field, thing[idx.field]);
            if (found != null) {
                if (thing?._meta?.id && found._meta?.id && thing?._meta?.id === found._meta?.id) {
                    // this is an update, we found ourselves: it's OK
                } else {
                    addError(errors, idx.field, "exists");
                }
            }
        }
    }
    if (hasErrors(errors)) {
        throw new MobilettoOrmValidationError(errors);
    }
};

export const redactAndApply = async <T extends MobilettoOrmObject>(
    typeDef: MobilettoOrmTypeDef,
    thing: T,
    opts?: MobilettoOrmFindOpts
): Promise<T> => {
    if (!opts) return thing;
    const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
    const maybeRedacted: T = noRedact ? thing : (typeDef.redact(thing) as T);
    const apply = opts && opts.apply ? opts.apply : null;
    if (apply) {
        const result = await apply(maybeRedacted);
        if (result && opts.applyResults) {
            opts.applyResults[typeDef.id(thing)] = result;
        }
    }
    return maybeRedacted;
};
